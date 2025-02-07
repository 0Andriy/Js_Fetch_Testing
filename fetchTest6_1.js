class FetchInterceptor {
    constructor({ getToken, refreshTokens, onAuthFailure, baseUrl = '', defaultHeaders = {} }) {
        this.getToken = getToken
        this.refreshTokens = refreshTokens
        this.onAuthFailure = onAuthFailure || (() => {})
        this.baseUrl = baseUrl
        this.defaultHeaders = defaultHeaders
        this.retryAttempts = 0
        this.tokenRefreshing = false
        this.pendingRequests = []
    }

    // Функція для перевірки, чи токен ще дійсний
    isTokenExpired(accessToken) {
        if (!accessToken) return true

        const payload = JSON.parse(atob(accessToken.split('.')[1])) // Декодуємо payload JWT - (0.1.2)
        const currentTime = Math.floor(Date.now() / 1000) // Поточний час у секундах
        return currentTime >= payload.exp // Порівнюємо поточний час з часом закінчення дії токена
    }

    buildUrl(url, params = {}) {
        const fullUrl = new URL(url.startsWith('http') ? url : `${this.baseUrl}${url}`)
        Object.keys(params).forEach((key) => fullUrl.searchParams.set(key, params[key]))
        return fullUrl.toString()
    }

    async fetch(url, options = {}, customTokens = {}) {
        let accessToken = customTokens.accessToken || (await this.getToken())

        // Якщо токен протермінований, спробуємо оновити його перед запитом
        if (
            (this.isTokenExpired(accessToken) || this.tokenRefreshing) &&
            !customTokens.accessToken
        ) {
            console.warn('Access token is expired, refreshing...')
            return this.handleUnauthorizedRequest(url, options)
        }

        const defaultOptions = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
            credentials: 'include',
            mode: 'cors',
            retryAttempts: 1,
        }

        if (options.data) {
            defaultOptions.body = JSON.stringify(options.data)
        }

        if (accessToken) {
            defaultOptions.headers['Authorization'] = `Bearer ${accessToken}`
        }

        options = {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers },
        }

        return this.fetchWithInterceptors(url, options, customTokens)
    }

    async fetchWithInterceptors(url, options, customTokens) {
        const controller = new AbortController()
        let timeoutId = null

        if (typeof options.timeout === 'number' && options.timeout > 0) {
            timeoutId = setTimeout(() => {
                controller.abort()
            }, options.timeout)
        }
        options.signal = controller.signal

        try {
            let response = await fetch(this.buildUrl(url, options.params || {}), options)

            if (response.status === 401 && options.retryAttempts > 0 && !customTokens.accessToken) {
                console.warn('Received 401, attempting token refresh...')
                options.retryAttempts-- // Зменшуємо кількість спроб
                return this.handleUnauthorizedRequest(url, options)
            }

            return this.handleResponse(response, options.responseType || 'json')
        } catch (error) {
            return this.handleError(error)
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
    }

    async handleUnauthorizedRequest(url, options) {
        if (!this.tokenRefreshing) {
            this.tokenRefreshing = true
            console.info('Refreshing token...')
            try {
                await this.refreshTokens()
                this.tokenRefreshing = false
                console.info('Token refreshed successfully, retrying pending requests...')
                this.pendingRequests.forEach((cb) => cb())
                this.pendingRequests = []
            } catch (error) {
                console.error('Token refresh failed:', error)
                this.tokenRefreshing = false
                this.pendingRequests = []
                this.onAuthFailure()
                throw new Error('Token refresh failed')
            }
        }

        return new Promise((resolve, reject) => {
            console.info('Queuing request until token refresh completes...')
            this.pendingRequests.push(async () => {
                try {
                    const result = await this.fetch(url, options)
                    resolve(result)
                } catch (err) {
                    reject(err)
                }
            })
        })
    }

    async handleResponse(response, responseType) {
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`)
        }
        if (responseType === 'json') return response.json()
        if (responseType === 'text') return response.text()
        if (responseType === 'stream') return response.body
        return response
    }

    handleError(error) {
        const msg = error.message.toLowerCase()
        if (
            msg.includes('failed to fetch') ||
            msg.includes('enotfound') ||
            msg.includes('econnrefused')
        ) {
            throw new Error(`No internet connection -> ${error.message}`)
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error(`No internet connection -> ${error.message}`)
        }

        if (error.name === 'AbortError') {
            throw new Error('Request was aborted')
        }
        throw error
    }
}

// <=================================================================================>

const $fetch = new FetchInterceptor({
    getToken: async () => localStorage.getItem('accessToken'),
    refreshTokens: async () => {
        const response = await fetch('https://api.example.com/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshTokens: localStorage.getItem('refreshToken') }),
        })
        if (!response.ok) throw new Error('Failed to refresh token')
        const data = await response.json()
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshTokens)
    },
    onAuthFailure: () => {
        console.error('Authentication failed. Redirecting to login...')
        if (typeof window !== 'undefined') {
            window.location.href = '/login'
        }
    },
    baseUrl: 'https://api.example.com',
    defaultHeaders: {
        'X-Custom-Header': 'MyValue',
        'Another-Header': 'Example',
    },
})

export default function fetchRequest(url, options = {}, customTokens = {}) {
    return $fetch.fetch(url, options, customTokens)
}

// Виконання GET-запиту з параметрами та отриманням текстової відповіді
fetchRequest('https://api.example.com/user/profile', { params: { id: 123 }, responseType: 'text' })
    .then((data) => console.log('User Profile:', data))
    .catch((error) => console.error('Error:', error))

// Виконання POST-запиту1
fetchRequest('https://api.example.com/user/update', {
    method: 'POST',
    body: JSON.stringify({ name: 'New Name' }),
})
    .then((data) => console.log('Update Success:', data))
    .catch((error) => console.error('Error:', error))

// Виконання POST-запиту2
fetchRequest('https://api.example.com/user/update', {
    method: 'POST',
    data: { name: 'New Name' },
})
    .then((data) => console.log('Update Success:', data))
    .catch((error) => console.error('Error:', error))

// Виконання запиту з кастомними токенами
fetchRequest('https://api.example.com/custom/resource', {}, { accessToken: 'customToken123' })
    .then((data) => console.log('Custom Token Response:', data))
    .catch((error) => console.error('Error:', error))

// Виконання запиту для потокової передачі
fetchRequest('https://api.example.com/stream', { responseType: 'stream' })
    .then((stream) => console.log('Stream received:', stream))
    .catch((error) => console.error('Error:', error))

// Виконання запиту з таймаутом
fetchRequest('https://api.example.com/timeout', { timeout: 5000 })
    .then((data) => console.log('Request completed:', data))
    .catch((error) => console.error('Error:', error))
