class FetchInterceptor {
    /**
     * Конструктор класу FetchInterceptor
     * @param {Object} config - Об'єкт налаштувань
     * @param {Function} config.getToken - Функція для отримання токена
     * @param {Function} config.refreshTokens - Функція для оновлення токенів
     * @param {Function} config.onAuthFailure - Функція, що викликається при невдалій аутентифікації
     * @param {string} [config.baseUrl=''] - Базовий URL для запитів
     * @param {Object} [config.defaultHeaders={}] - Заголовки за замовчуванням
     * @param {number} [config.maxRetryAttempts=2] - Максимальна кількість спроб повторного запиту
     */
    constructor({
        getToken,
        refreshTokens,
        onAuthFailure,
        baseUrl = '',
        defaultHeaders = {},
        maxRetryAttempts = 2,
    }) {
        this.getToken = getToken
        this.refreshTokens = refreshTokens
        this.onAuthFailure = onAuthFailure || ((options) => {})
        this.baseUrl = baseUrl
        this.defaultHeaders = defaultHeaders
        this.tokenRefreshing = false
        this.pendingRequests = []
        this.maxRetryAttempts = maxRetryAttempts
    }

    /**
     * Перевіряє, чи протермінований JWT токен.
     * Токен вважається протермінованим, якщо час, вказаний у полі `exp`, менший за поточний час.
     *
     * @param {string} token - JWT токен, який потрібно перевірити.
     *
     * @returns {boolean} - Повертає `true`, якщо токен протермінований, інакше `false`.
     *
     * @example
     * // Приклад перевірки токена
     * isTokenExpired('qwerty.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.1234567890')
     *     // Поверне: true або false в залежності від того, чи протермінований токен
     */
    isTokenExpired(token) {
        if (!token) return true

        try {
            // Decode token to get payload
            const payload = JSON.parse(atob(token.split('.')[1]))
            // Check if token is expired
            return Date.now() >= payload.exp * 1000

            // or return Math.floor(Date.now() / 1000) >= payload.exp
        } catch (error) {
            // If there is an error, token is considered expired
            return true
        }
    }

    /**
     * Формує повний URL з параметрами запиту, додаючи параметри до базового URL.
     * Якщо URL вже є повним, метод повертає його без змін.
     *
     * @param {string} url - Базовий URL або шлях до ресурсу, до якого потрібно додати параметри.
     * @param {Object} [params={}] - Об'єкт параметрів запиту, які будуть додані до URL як query-параметри.
     *
     * @returns {string} - Сформований повний URL з доданими параметрами запиту.
     *
     * @example
     * // Приклад використання для базового URL та параметрів
     * buildUrl('https://api.example.com', { page: 1, limit: 10 })
     *     // Поверне: 'https://api.example.com/?page=1&limit=10'
     */
    buildUrl(url, params = {}) {
        // If URL is already a full URL, return it
        const fullUrl = new URL(url.startsWith('http') ? url : `${this.baseUrl}${url}`)

        // Add params to URL
        Object.entries(params).forEach(([key, value]) => fullUrl.searchParams.set(key, value))

        // Return full URL
        return fullUrl.toString()
    }

    /**
     * Виконує HTTP-запит з переданими налаштуваннями та обробкою токенів авторизації.
     * Запит підтримує налаштування за замовчуванням, можливість додавання авторизаційних токенів та обробку помилок.
     *
     * @param {string} url - URL або шлях до ресурсу, до якого здійснюється запит.
     * @param {Object} options - Налаштування запиту, що передаються в `fetch`. Може включати метод запиту (GET, POST тощо), заголовки, тіло запиту, таймаут та інші параметри.
     * @param {number} [attempt=0] - Лічильник спроб виконання запиту (використовується для повторних спроб при необхідності).
     *
     * @returns {Promise<any>} - Обіцянка, яка повертає відповідь сервера у відповідному форматі, що залежить від налаштувань запиту.
     *
     * @throws {Error} - Якщо під час виконання запиту виникає помилка, вона буде оброблена через метод `handleError` або інші механізми обробки помилок.
     *
     * @example
     * // Простий запит GET
     * fetch('https://api.example.com/data', { method: 'GET' })
     *     .then(response => console.log(response))
     *     .catch(error => console.error(error))
     *
     * @example
     * // POST запит з даними
     * fetch('https://api.example.com/data', {
     *     method: 'POST',
     *     data: { key: 'value' }
     * })
     *     .then(response => console.log(response))
     *     .catch(error => console.error(error))
     */
    async fetch(url, options = {}, attempt = 0) {
        // Default options for fetch - Default options are marked with *
        const defaultOptions = {
            method: 'GET', // *GET, POST, PUT, DELETE, etc.
            mode: 'cors', // no-cors, *cors, same-origin
            cache: 'default', // *default, no-cache, reload, force-cache, only-if-cached
            credentials: 'same-origin', // include, *same-origin, omit
            headers: {
                'Content-Type': 'application/json',
                // 'Content-Type': 'application/x-www-form-urlencoded',
                ...this.defaultHeaders,
            },
            redirect: 'follow', // manual, *follow, error
            // referrerPolicy: 'no-referrer', // no-referrer, *client
            body: null, //JSON.stringify(data), // body data type must match "Content-Type" header
        }

        // Merge default options with the provided options
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers },
        }

        // If data is an object, convert it to a JSON string and add body to options
        if (options.data && typeof options.data === 'object') {
            finalOptions.body = JSON.stringify(options.data)
        }

        //
        if (!options.skipAuth) {
            // Get accessToken from call getToken method
            let accessToken = await this.getToken(options)

            //
            if (accessToken && this.isTokenExpired(accessToken)) {
                return this.handleUnauthorizedRequest(url, options, attempt)
            }

            // Add Authorization header if accessToken is provided
            if (accessToken) {
                finalOptions.headers.Authorization = `Bearer ${accessToken}`
            }
        }

        // Call fetch with the final options
        return this.fetchWithInterceptors(url, finalOptions, attempt)
    }

    /**
     * Обробляє виконання запиту з перехопленням помилок, таймаутами та обробкою неавторизованих запитів.
     * Запит буде перезапущений, якщо токен буде невалідним (статус 401), а також надається обробка помилок при невдачах запиту.
     *
     * @param {string} url - URL запиту.
     * @param {Object} options - Налаштування запиту, що передаються в `fetch`, включаючи метод, заголовки, body, таймаут і параметри.
     * @param {number} attempt - Лічильник спроб повторного виконання запиту (збільшується при кожному новому виклику).
     *
     * @returns {Promise<any>} - Обіцянка, яка містить відповідь на запит у відповідному форматі.
     *      Якщо запит повертає статус 401 (не авторизовано), відбудеться спроба повторити запит після оновлення токенів.
     *
     * @throws {Error} - Якщо запит не вдається, буде викинута помилка, оброблена за допомогою методу `handleError`.
     *      Можуть виникнути помилки при відсутності інтернету, таймауті або інших критичних помилках.
     *
     * @example
     * try {
     *     const response = await this.fetchWithInterceptors(url, options, attempt);
     *     // Обробка успішної відповіді
     * } catch (error) {
     *     // Обробка помилки
     * }
     */
    async fetchWithInterceptors(url, options, attempt) {
        let timeoutId = null

        // Перевірка таймауту для запиту
        if (options.timeout && typeof options.timeout === 'number' && options.timeout > 0) {
            const controller = new AbortController()
            timeoutId = setTimeout(() => controller.abort(), options.timeout)
            options.signal = controller.signal
        }

        //
        try {
            // Виконання запиту через fetch
            const response = await fetch(this.buildUrl(url, options.params || {}), options)

            // Обробка випадку, коли статус відповіді 401 (не авторизовано)
            if (response.status === 401) {
                return this.handleUnauthorizedRequest(url, options, attempt)
            }

            // Обробка відповіді в залежності від типу
            return this.handleResponse(response, options.responseType || 'json')
        } catch (error) {
            // Обробка помилки
            return this.handleError(error)
        } finally {
            // Очистка таймауту, якщо він був встановлений
            if (timeoutId) clearTimeout(timeoutId)
        }
    }

    /**
     * Обробляє неавторизований запит, що виникає, коли сервер повертає статус 401 (не авторизовано).
     * Метод автоматично спробує оновити токен доступу, якщо це потрібно, і повторить запит.
     * У разі неуспішної спроби оновлення токенів буде викинута помилка.
     *
     * @param {string} url - URL, до якого здійснюється запит.
     * @param {Object} options - Опції запиту, які передаються в функцію `fetch`. Це може включати заголовки, метод, body та інші параметри.
     * @param {number} attempt - Лічильник кількості спроб повторного запиту (для контролю кількості спроб).
     *
     * @returns {Promise<any>} - Обіцянка, яка повертає результат повторного запиту після оновлення токенів.
     *      Якщо токен оновлено успішно, запит повторюється з новим токеном. Якщо оновлення токенів не вдалося,
     *      буде викинута помилка.
     *
     * @throws {Error} - У разі досягнення максимальної кількості спроб оновлення токенів або невдалого оновлення токенів.
     *      Буде викинута помилка, що вказує на невдачу у оновленні токенів.
     *
     * @example
     * try {
     *     const response = await this.handleUnauthorizedRequest(url, options, attempt);
     *     // Обробка успішної відповіді
     * } catch (error) {
     *     // Обробка помилки (наприклад, якщо не вдалося оновити токени)
     * }
     */
    async handleUnauthorizedRequest(url, options, attempt) {
        // Перевірка, чи досягнуто максимальної кількості спроб оновлення токенів
        if (attempt >= this.maxRetryAttempts) {
            this.onAuthFailure(options)
            throw new Error('Max token refresh attempts reached')
        }

        // Якщо токен зараз оновлюється, ставимо запит в чергу на виконання
        if (this.tokenRefreshing) {
            return new Promise((resolve, reject) => {
                this.pendingRequests.push(async () => {
                    try {
                        resolve(await this.fetch(url, options, {}, attempt + 1))
                    } catch (err) {
                        reject(err)
                    }
                })
            })
        }

        // Оновлення токенів, якщо це необхідно
        this.tokenRefreshing = true
        try {
            // Спроба оновлення токенів
            await this.refreshTokens(options)
            this.tokenRefreshing = false

            // Виконання всіх запитів, що були в черзі під час оновлення токенів
            this.pendingRequests.forEach((cb) => cb())
            this.pendingRequests = []

            // Повторний запит з новими токенами
            return this.fetch(url, options, {}, attempt + 1)
        } catch (error) {
            // Якщо не вдалося оновити токени
            this.tokenRefreshing = false
            this.pendingRequests.forEach((cb) =>
                cb(Promise.reject(new Error('Token refresh failed'))),
            )
            this.pendingRequests = []
            this.onAuthFailure(options)
            throw new Error('Token refresh failed')
        } finally {
            // Очищення стану після виконання запиту
            this.tokenRefreshing = false
            this.pendingRequests = []
        }
    }

    /**
     * Обробляє відповідь запиту в залежності від заданого типу даних.
     * Цей метод обирає, який формат даних повернути на основі параметра `responseType`.
     * Якщо параметр не заданий, за замовчуванням повертається JSON-об'єкт.
     *
     * @param {Response} response - Об'єкт відповіді від запиту, що містить статус, заголовки і тіло відповіді.
     *      - `response.ok`: логічне значення, яке вказує, чи є запит успішним (статус 2xx).
     *      - `response.status`: HTTP статусний код відповіді (наприклад, 200 для успішних запитів).
     *      - `response.statusText`: текстове повідомлення до статусного коду (наприклад, "OK").
     * @param {string} [responseType='json'] - Тип даних, які мають бути повернуті. Доступні варіанти:
     *      - `'text'`: повертає відповідь як текстовий рядок.
     *      - `'json'`: повертає відповідь як об'єкт JSON (за замовчуванням).
     *      - `'blob'`: повертає відповідь як об'єкт Blob (наприклад, для зображень або файлів).
     *      - `'arrayBuffer'`: повертає відповідь як масив байтів (для роботи з двійковими даними).
     *      - `'formData'`: повертає відповідь як об'єкт FormData, який можна використовувати для роботи з формами.
     *      - `'stream'`: повертає відповідь як потік.
     *      Якщо тип не вказаний, за замовчуванням повертається об'єкт у форматі JSON.
     *
     * @returns {Promise<any>} - Обіцянка, яка повертає дані відповіді у відповідному форматі. Тип результату залежить від вибраного `responseType`.
     *      - Якщо `responseType` = 'text', повертається текст.
     *      - Якщо `responseType` = 'json', повертається об'єкт JSON.
     *      - Якщо `responseType` = 'blob', повертається об'єкт Blob.
     *      - Якщо `responseType` = 'arrayBuffer', повертається масив байтів.
     *      - Якщо `responseType` = 'formData', повертається об'єкт FormData.
     *      - Якщо `responseType` = 'stream', повертається потік.
     *
     * @throws {Error} - Якщо статус відповіді не є успішним (не 2xx), буде викинута помилка з інформацією про статус.
     *      - Наприклад, якщо відповідь має статус 404 або 500, буде викинута помилка з повідомленням типу "HTTP 404: Not Found".
     */
    async handleResponse(response, responseType = 'json') {
        // Перевірка статусу відповіді на наявність помилки
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // Обробка залежно від типу даних, що мають бути повернуті
        switch (responseType) {
            case 'text':
                return response.text() // Повертає відповідь як текстовий рядок
            case 'json':
                return response.json() // Повертає відповідь як об'єкт JSON
            case 'blob':
                return response.blob() // Повертає відповідь як об'єкт JSON
            case 'arrayBuffer':
                return response.arrayBuffer() // Повертає відповідь як масив байтів
            case 'formData':
                return response.formData() // Повертає відповідь як FormData
            case 'stream':
                return response.body // Повертає відповідь як потік
            default:
                return response // Якщо не вказано тип, повертає оригінальний об'єкт response
        }
    }

    /**
     * Обробляє помилки, що виникають під час виконання запитів або інших операцій.
     *
     * Метод перевіряє тип помилки і викидає специфічні повідомлення для певних випадків,
     * таких як тайм-аут запиту, відсутність інтернет-з'єднання або мережеві помилки.
     *
     * @param {Error} error - Помилка, яка була передана в метод для обробки.
     *
     * @throws {Error} - Викидає помилку з детальним повідомленням, якщо:
     * - Тайм-аут запиту (AbortError).
     * - Відсутнє інтернет-з'єднання (для браузера).
     * - Мережеві помилки, такі як неможливість підключитися до сервера або неправильний запит (для Node.js).
     * - Будь-яка інша помилка передається далі без змін.
     */
    handleError(error) {
        // Обробка тайм-ауту запиту
        if (error.name === 'AbortError') {
            throw new Error('Request timeout exceeded')
        }

        // Обробка відсутності інтернет-з'єднання (тільки для браузера)
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('No internet connection')
        }

        // Обробка мережевих помилок (тільки для Node.js)
        if (
            error.code === 'ENOTFOUND' ||
            error.message.includes('NetworkError') ||
            error.message.includes('Failed to fetch')
        ) {
            throw new Error('Network error or server unreachable')
        }

        // Передача інших помилок без змін
        throw error
    }
}

// === Ініціалізація ===
const $fetch = new FetchInterceptor({
    getToken: async (options) => {
        // localStorage.getItem('accessToken')
        return 'accessToken'
    },
    refreshTokens: async (options) => {
        const refreshToken = localStorage.getItem('refreshToken')

        const response = await fetch('https://api.example.com/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) throw new Error('Failed to refresh token')

        const data = await response.json()
        // localStorage.setItem('accessToken', data.accessToken)
        // localStorage.setItem('refreshToken', data.refreshTokens)
    },
    onAuthFailure: (options) => {
        console.error('Authentication failed. Redirecting to login...')
        if (typeof window !== 'undefined') {
            window.location.href = '/login'
        }
    },
    baseUrl: 'https://api.example.com',
    defaultHeaders: { 'X-Custom-Header': 'MyValue' },
    maxRetryAttempts: 2,
})

// === Експорт для використання ===
export default function fetchRequest(url, options = {}) {
    return $fetch.fetch(url, options)
}

// === Тестування ===
// Перевірка, чи файл запущений напряму
if (import.meta.url === new URL('', import.meta.url).href) {
    ;(async () => {
        console.log('Запуск тестів...')

        // Ініціалізація тестових токенів
        // localStorage.setItem('accessToken', 'testAccessToken');
        // localStorage.setItem('refreshToken', 'testRefreshToken');

        try {
            // Тест оновлення токенів
            console.log('Тест: Оновлення токенів...')
            // const newToken = await updateTokens();
            // console.log('Новий токен:', newToken);

            // Тест запиту через $fetch
            console.log('Тест: Виконання запиту через $fetch...')
            const response = await fetchRequest('https://jsonplaceholder.typicode.com/posts/1', {
                method: 'GET',
                skipAuth: true,
            })
            console.log('Результат запиту:', response)
        } catch (error) {
            console.error('Помилка при тестуванні:', error)
        }

        //
        try {
            console.log('Тест: Виконання запиту через $fetch...')
            const response = await fetchRequest('https://jsonplaceholder.typicode.com/comments', {
                skipAuth: true,
                params: {
                    postId: 1,
                },
            })
            console.log('Результат запиту:', response)
        } catch (error) {
            console.error('Помилка при тестуванні:', error)
        }

        //
        try {
            console.log('Тест: Виконання запиту через $fetch...')
            const response = await fetchRequest('https://jsonplaceholder.typicode.com/posts', {
                method: 'POST',
                skipAuth: true,
                data: {
                    name: 'userTest1',
                    password: 'test',
                },
            })
            console.log('Результат запиту:', response)
        } catch (error) {
            console.error('Помилка при тестуванні:', error)
        }
    })()
}
