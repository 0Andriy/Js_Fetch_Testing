class FetchInterceptor {
    constructor({ getToken, refreshToken, onAuthFailure, baseUrl = '', maxAuthRetries = 2 }) {
        this.getToken = getToken
        this.refreshToken = refreshToken
        this.onAuthFailure = onAuthFailure || (() => {})
        this.baseUrl = baseUrl
        this.maxAuthRetries = maxAuthRetries
        this.tokenRefreshing = false
        this.pendingRequests = []
        this.refreshTokenPromise = null
    }

    buildUrl(url, params = {}) {
        const fullUrl = new URL(url.startsWith('http') ? url : `${this.baseUrl}${url}`)
        Object.keys(params).forEach((key) => fullUrl.searchParams.append(key, params[key]))
        return fullUrl.toString()
    }

    async fetch(url, options = {}, customTokens = {}, retryCount = 0) {
        let accessToken = customTokens.accessToken || (await this.getToken())

        if (!customTokens.accessToken && this.isTokenExpired(accessToken)) {
            await this.ensureTokenRefreshed()
            accessToken = await this.getToken()
        }

        const defaultOptions = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            mode: 'cors',
        }

        if (accessToken) {
            defaultOptions.headers['Authorization'] = `Bearer ${accessToken}`
        }

        options = {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers },
        }

        return this.fetchWithInterceptors(url, options, customTokens, retryCount)
    }

    async fetchWithInterceptors(url, options, customTokens, retryCount) {
        const controller = new AbortController()
        let timeoutId
        if (options.timeout > 0) {
            timeoutId = setTimeout(() => controller.abort(), options.timeout)
        }
        options.signal = controller.signal

        try {
            let response = await fetch(this.buildUrl(url, options.params || {}), options)
            return this.handleResponse(response.clone(), options.responseType || 'json')
        } catch (error) {
            return this.handleError(error)
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
    }

    async ensureTokenRefreshed() {
        if (!this.refreshTokenPromise) {
            this.refreshTokenPromise = (async () => {
                try {
                    await this.refreshToken()
                } finally {
                    this.refreshTokenPromise = null
                }
            })()
        }
        await this.refreshTokenPromise
    }

    async handleUnauthorizedRequest(url, options, retryCount) {
        if (retryCount >= this.maxAuthRetries) {
            throw new Error('Token refresh failed after multiple attempts')
        }
        await this.ensureTokenRefreshed()
        return this.fetch(url, options, {}, retryCount + 1)
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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('No internet connection')
        }
        if (error.name === 'AbortError') {
            throw new Error('Request was aborted')
        }
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
            throw new Error('Network is unreachable')
        }
        throw error
    }

    isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]))
            return Date.now() >= payload.exp * 1000
        } catch (error) {
            return true
        }
    }
}

const $fetch = new FetchInterceptor({
    getToken: async () => localStorage.getItem('accessToken'),
    refreshToken: async () => {
        const response = await fetch('https://api.example.com/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: localStorage.getItem('refreshToken') }),
        })
        if (!response.ok) throw new Error('Failed to refresh token')
        const data = await response.json()
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
    },
    onAuthFailure: () => {
        console.error('Authentication failed. Redirecting to login...')
        if (typeof window !== 'undefined') {
            window.location.href = '/login'
        }
    },
    baseUrl: 'https://api.example.com',
})

export default function fetchRequest(url, options = {}, customTokens = {}) {
    return $fetch.fetch(url, options, customTokens)
}
