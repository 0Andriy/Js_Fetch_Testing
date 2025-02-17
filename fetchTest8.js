class FetchInterceptor {
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
     * Перевірка чи токен не прострочений по даті закінчення
     * @param {string} token - токен
     * @returns {boolean} - чи прострочений токен
     * @example: isTokenExpired(qwerty.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.1234567890)
     * */
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
     * Побудова URL з параметрами запиту в об'єкті params
     * @param {string} url - URL або шлях до ресурсу
     * @param {object} params - параметри
     * @returns {string} - повний URL
     * @example: buildUrl('https://api.example.com', { page: 1, limit: 10 })
     * */
    buildUrl(url, params = {}) {
        // If URL is already a full URL, return it
        const fullUrl = new URL(url.startsWith('http') ? url : `${this.baseUrl}${url}`)
        // Add params to URL
        Object.entries(params).forEach(([key, value]) => fullUrl.searchParams.set(key, value))
        // Return full URL
        return fullUrl.toString()
    }

    /** Виконання запиту fetch
     * @param {string} url - URL або шлях до ресурсу
     * @param {object} options - параметри запиту
     * @param {object} customTokens - додаткові токени
     * @returns {Promise<any>} - результат запиту
     * @example: fetch('https://api.example.com/data', { method: 'GET' })
     * */
    async fetch(url, options = {}, customTokens = {}, attempt = 0) {
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
            // Get accessToken from customTokens or call getToken method
            let accessToken = customTokens.accessToken || (await this.getToken(options))

            //
            if (!customTokens.accessToken && accessToken && this.isTokenExpired(accessToken)) {
                return this.handleUnauthorizedRequest(url, options, attempt)
            }

            // Add Authorization header if accessToken is provided
            if (accessToken) {
                finalOptions.headers.Authorization = `Bearer ${accessToken}`
            }
        }

        // Call fetch with the final options
        return this.fetchWithInterceptors(url, finalOptions, customTokens, attempt)
    }

    //
    async fetchWithInterceptors(url, options, customTokens, attempt) {
        let timeoutId = null

        if (options.timeout && typeof options.timeout === 'number' && options.timeout > 0) {
            const controller = new AbortController()
            timeoutId = setTimeout(() => controller.abort(), options.timeout)
            options.signal = controller.signal
        }

        try {
            const response = await fetch(this.buildUrl(url, options.params || {}), options)

            if (response.status === 401 && !customTokens.accessToken) {
                return this.handleUnauthorizedRequest(url, options, attempt)
            }

            return this.handleResponse(response, options.responseType || 'json')
        } catch (error) {
            return this.handleError(error)
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
    }

    async handleUnauthorizedRequest(url, options, attempt) {
        if (attempt >= this.maxRetryAttempts) {
            this.onAuthFailure(options)
            throw new Error('Max token refresh attempts reached')
        }

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

        this.tokenRefreshing = true
        try {
            await this.refreshTokens(options)
            this.tokenRefreshing = false
            this.pendingRequests.forEach((cb) => cb())
            this.pendingRequests = []
            return this.fetch(url, options, {}, attempt + 1)
        } catch (error) {
            this.tokenRefreshing = false
            this.pendingRequests.forEach((cb) =>
                cb(Promise.reject(new Error('Token refresh failed'))),
            )
            this.pendingRequests = []
            this.onAuthFailure(options)
            throw new Error('Token refresh failed')
        } finally {
            this.tokenRefreshing = false
            this.pendingRequests = []
        }
    }

    async handleResponse(response, responseType) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        if (response.status === 204) return null // Немає контенту

        switch (responseType) {
            case 'json':
                return response.json()
            case 'text':
                return response.text()
            case 'stream':
                return response.body
            default:
                return response
        }
    }

    handleError(error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout exceeded')
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('No internet connection')
        }

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
export default function fetchRequest(url, options = {}, customTokens = {}) {
    return $fetch.fetch(url, options, customTokens)
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
    })()
}
