// <====================================================>
class FetchWrapper {
    constructor({ baseUrl = '', token = null, maxRetries = 3 } = {}) {
        this.baseUrl = baseUrl
        this.token = token
        this.maxRetries = maxRetries
    }

    // Утиліта для додавання квері параметрів
    static buildQueryParams(params) {
        const searchParams = new URLSearchParams()
        for (let key in params) {
            if (Array.isArray(params[key])) {
                params[key].forEach((value) => searchParams.append(key, value))
            } else {
                searchParams.append(key, params[key])
            }
        }
        return searchParams.toString()
    }

    // Інтерсептор для запитів
    _requestInterceptor(url, config = {}) {
        const { method = 'GET', headers = {}, params = null, ...rest } = config

        // Дефолтні заголовки
        const defaultHeaders = {
            'Content-Type': 'application/json',
        }

        const finalHeaders = { ...defaultHeaders, ...headers }

        // Додавання токена
        if (this.token) {
            finalHeaders['Authorization'] = `Bearer ${this.token}`
        }

        // Формування повного URL
        let fullUrl = this.baseUrl ? `${this.baseUrl}${url}` : url

        // Додавання квері параметрів
        if (params) {
            const queryParams = FetchWrapper.buildQueryParams(params)
            fullUrl += `?${queryParams}`
        }

        return [fullUrl, { method, headers: finalHeaders, ...rest }]
    }

    // Інтерсептор для відповідей
    async _responseInterceptor(response) {
        // Логіка для JSON, Text, Blob і т.д.
        const contentType = response.headers.get('content-type')
        let responseData

        if (response.ok) {
            if (contentType.includes('application/json')) {
                responseData = await response.json()
            } else if (contentType.includes('text')) {
                responseData = await response.text()
            } else {
                responseData = await response.blob() // Підтримка Blob-даних
            }
            return { message: 'Success', data: responseData }
        } else {
            const errorData = contentType.includes('application/json')
                ? await response.json()
                : response.statusText
            return { message: 'Failed', data: null, reason: errorData }
        }
    }

    // Тайм-аут для запиту
    _withTimeout(ms, promise) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), ms)

        return Promise.race([
            promise,
            new Promise((_, reject) => {
                reject({ message: 'Request timed out' })
            }),
        ]).finally(() => clearTimeout(timeout))
    }

    // Обгортка для fetch з ретраями
    async _fetchWithRetry(url, options, retries) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, options)
                return response
            } catch (err) {
                if (attempt === retries) {
                    throw new Error(`Fetch failed after ${retries} attempts: ${err}`)
                }
                console.warn(`Retrying fetch... (${attempt}/${retries})`)
            }
        }
    }

    // Основна функція для виклику fetch
    async request(url, options = {}, timeout = 5000) {
        try {
            const [finalUrl, finalOptions] = this._requestInterceptor(url, options)

            // Виклик fetch з тайм-аутом і ретраями
            const response = await this._withTimeout(
                timeout,
                this._fetchWithRetry(finalUrl, finalOptions, this.maxRetries),
            )

            // Обробка відповіді
            return await this._responseInterceptor(response)
        } catch (error) {
            return { message: 'Failed', data: null, reason: error.message }
        }
    }
}

// Приклад використання
const fetchWrapper = new FetchWrapper({
    baseUrl: 'https://jsonplaceholder.typicode.com',
    token: 'yourAccessToken',
    maxRetries: 3,
})

const response = await fetchWrapper.request('/todos', {
    method: 'GET',
    params: { userId: 1 },
})

console.log(response)


