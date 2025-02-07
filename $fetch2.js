// Інтерсептор для запитів з підтримкою дефолтних значень
function fetchRequestInterceptor(url, config = {}, token = null, baseUrl = null) {
    // Дефолтний шаблон заголовків
    const defaultHeaders = {
        'Content-Type': 'application/json',
    }

    // Декомпозиція даних з конфігурації
    const { method = 'GET', headers = {}, credentials = 'include', params = null, ...rest } = config

    // Використання дефолтних параметрів або користувацьких
    const requestOptions = {
        method, // Якщо не вказано, використовуємо 'GET'
        headers: { ...defaultHeaders, ...headers }, // Об'єднання дефолтних і користувацьких заголовків
        credentials, // Передача cookie, якщо не вказано інше
        ...rest,
    }

    // Додавання JWT токена до заголовків (якщо передано)
    if (token) {
        requestOptions.headers['Authorization'] = `Bearer ${token}`
    }

    // Формування повного URL
    let fullUrl = baseUrl ? `${baseUrl}${url}` : url

    // Додавання квері параметрів (якщо є params)
    if (params) {
        const urlObj = new URL(fullUrl)
        const searchParams = new URLSearchParams(params)
        urlObj.search = searchParams.toString()
        fullUrl = urlObj.toString()
    }

    // Повертаємо модифіковані параметри для запиту
    return [fullUrl, requestOptions]
}

// Інтерсептор для відповідей
async function fetchResponseInterceptor(response) {
    // Перевірка статусу відповіді
    if (response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
            return { message: 'Success', data: await response.json() }
        } else {
            return { message: 'Success', data: await response.text() }
        }
    } else {
        return { message: 'Failed', data: null, reason: response.statusText }
    }
}

// Функція для оновлення токенів
async function refreshTokens() {
    // Логіка для оновлення токенів
    const response = await fetch('/api/refresh-token', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ refreshToken }),
    })

    // Обробка помилок
    if (!response.ok) {
        throw new Error('Не вдалося оновити токен')
    }

    // Парсинг відповіді
    const data = await response.json()

    // Отримання нових токенів
    let accessToken = data.accessToken
    let refreshToken = data.refreshToken

    // Збережіть нові токени
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
}

// Обгортка для fetch з підтримкою дефолтного виклику
async function $fetch(url, options = {}, isRetry = false, token = null, baseUrl = null) {
    try {
        // Виклик інтерсептора для запитів (модифікація URL та параметрів запиту перед виконанням самого запиту)
        const [finalUrl, finalOptions] = fetchRequestInterceptor(url, options, token, baseUrl)

        // Виклик дефолтного (базового) fetch з модифікованими параметрами
        const response = await fetch(finalUrl, finalOptions)

        // Перевірка на 401 (неавторизовано) і повторний запит
        if (response.status === 401 && !isRetry) {
            const refreshedToken = await refreshTokens() // Оновлюємо токен

            // Повторний запит з оновленим токеном
            return $fetch(url, options, true, refreshedToken, baseUrl)
        }

        // Виклик інтерсептора для обробки відповіді
        return await fetchResponseInterceptor(response)
    } catch (err) {
        console.warn('Fetch Error:', err)
        return { message: 'Failed', data: null, reason: err.message }
    }
}

// Використання

// 1. Стандартний виклик без додаткових параметрів
const defaultResponse = await $fetch('https://jsonplaceholder.typicode.com/todos/1')
console.log(defaultResponse)

// 2. Виклик з параметрами (token, baseUrl, params)
const responseWithParams = await $fetch(
    '/todos',
    {
        method: 'GET',
        params: { userId: 1 }, // Додавання квері параметрів
        headers: {
            'Custom-Header': 'CustomValue',
        },
    },
    false,
    'yourAccessToken',
    'https://jsonplaceholder.typicode.com',
)

console.log(responseWithParams)

// <====================================================>
// class FetchWrapper {
//     constructor({ baseUrl = '', token = null, maxRetries = 3 } = {}) {
//         this.baseUrl = baseUrl;
//         this.token = token;
//         this.maxRetries = maxRetries;
//     }

//     // Утиліта для додавання квері параметрів
//     static buildQueryParams(params) {
//         const searchParams = new URLSearchParams();
//         for (let key in params) {
//             if (Array.isArray(params[key])) {
//                 params[key].forEach(value => searchParams.append(key, value));
//             } else {
//                 searchParams.append(key, params[key]);
//             }
//         }
//         return searchParams.toString();
//     }

//     // Інтерсептор для запитів
//     _requestInterceptor(url, config = {}) {
//         const { method = 'GET', headers = {}, params = null, ...rest } = config;

//         // Дефолтні заголовки
//         const defaultHeaders = {
//             'Content-Type': 'application/json',
//         };

//         const finalHeaders = { ...defaultHeaders, ...headers };

//         // Додавання токена
//         if (this.token) {
//             finalHeaders['Authorization'] = `Bearer ${this.token}`;
//         }

//         // Формування повного URL
//         let fullUrl = this.baseUrl ? `${this.baseUrl}${url}` : url;

//         // Додавання квері параметрів
//         if (params) {
//             const queryParams = FetchWrapper.buildQueryParams(params);
//             fullUrl += `?${queryParams}`;
//         }

//         return [fullUrl, { method, headers: finalHeaders, ...rest }];
//     }

//     // Інтерсептор для відповідей
//     async _responseInterceptor(response) {
//         // Логіка для JSON, Text, Blob і т.д.
//         const contentType = response.headers.get('content-type');
//         let responseData;

//         if (response.ok) {
//             if (contentType.includes('application/json')) {
//                 responseData = await response.json();
//             } else if (contentType.includes('text')) {
//                 responseData = await response.text();
//             } else {
//                 responseData = await response.blob(); // Підтримка Blob-даних
//             }
//             return { message: 'Success', data: responseData };
//         } else {
//             const errorData = contentType.includes('application/json')
//                 ? await response.json()
//                 : response.statusText;
//             return { message: 'Failed', data: null, reason: errorData };
//         }
//     }

//     // Тайм-аут для запиту
//     _withTimeout(ms, promise) {
//         const controller = new AbortController();
//         const timeout = setTimeout(() => controller.abort(), ms);

//         return Promise.race([
//             promise,
//             new Promise((_, reject) => {
//                 reject({ message: 'Request timed out' });
//             })
//         ]).finally(() => clearTimeout(timeout));
//     }

//     // Обгортка для fetch з ретраями
//     async _fetchWithRetry(url, options, retries) {
//         for (let attempt = 1; attempt <= retries; attempt++) {
//             try {
//                 const response = await fetch(url, options);
//                 return response;
//             } catch (err) {
//                 if (attempt === retries) {
//                     throw new Error(`Fetch failed after ${retries} attempts: ${err}`);
//                 }
//                 console.warn(`Retrying fetch... (${attempt}/${retries})`);
//             }
//         }
//     }

//     // Основна функція для виклику fetch
//     async request(url, options = {}, timeout = 5000) {
//         try {
//             const [finalUrl, finalOptions] = this._requestInterceptor(url, options);

//             // Виклик fetch з тайм-аутом і ретраями
//             const response = await this._withTimeout(timeout, this._fetchWithRetry(finalUrl, finalOptions, this.maxRetries));

//             // Обробка відповіді
//             return await this._responseInterceptor(response);
//         } catch (error) {
//             return { message: 'Failed', data: null, reason: error.message };
//         }
//     }
// }

// // Приклад використання
// const fetchWrapper = new FetchWrapper({
//     baseUrl: 'https://jsonplaceholder.typicode.com',
//     token: 'yourAccessToken',
//     maxRetries: 3,
// });

// const response = await fetchWrapper.request('/todos', {
//     method: 'GET',
//     params: { userId: 1 }
// });

// console.log(response);
