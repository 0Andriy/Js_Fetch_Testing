class FetchInterceptor {
    constructor({ getToken, refreshToken, onAuthFailure }) {
        this.getToken = getToken
        this.refreshToken = refreshToken
        this.onAuthFailure = onAuthFailure
        this.tokenRefreshing = false
        this.pendingRequests = []
    }

    buildUrl(url, params = {}) {
        const fullUrl = new URL(url)
        Object.keys(params).forEach((key) => fullUrl.searchParams.append(key, params[key]))
        return fullUrl.toString()
    }

    async fetch(url, options = {}, customTokens = {}) {
        let accessToken = customTokens.accessToken || (await this.getToken())

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

        return this.fetchWithInterceptors(url, options, customTokens)
    }

    async fetchWithInterceptors(url, options, customTokens) {
        try {
            let response = await fetch(this.buildUrl(url), options)
            if (response.status === 401 && !customTokens.accessToken) {
                return this.handleUnauthorizedRequest(url, options)
            }
            return this.handleResponse(response)
        } catch (error) {
            return this.handleError(error)
        }
    }

    async handleUnauthorizedRequest(url, options) {
        if (!this.tokenRefreshing) {
            this.tokenRefreshing = true
            try {
                await this.refreshToken()
                this.tokenRefreshing = false
                this.pendingRequests.forEach((cb) => cb())
                this.pendingRequests = []
            } catch (error) {
                this.tokenRefreshing = false
                this.pendingRequests = []
                if (this.onAuthFailure) {
                    this.onAuthFailure()
                }
                throw new Error('Token refresh failed')
            }
        }

        return new Promise((resolve) => {
            this.pendingRequests.push(() => resolve(this.fetchWithInterceptors(url, options)))
        })
    }

    async handleResponse(response) {
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`)
        }
        return response.json()
    }

    handleError(error) {
        if (!navigator.onLine) {
            throw new Error('No internet connection')
        }
        throw error
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
        window.location.href = '/login'
    },
})

export default function fetchRequest(url, options, customTokens = {}) {
    return $fetch.fetch(url, options, customTokens)
}

// Виконання GET-запиту
fetchRequest('https://api.example.com/user/profile')
    .then((data) => console.log('User Profile:', data))
    .catch((error) => console.error('Error:', error))

// Виконання POST-запиту
fetchRequest('https://api.example.com/user/update', {
    method: 'POST',
    body: JSON.stringify({ name: 'New Name' }),
})
    .then((data) => console.log('Update Success:', data))
    .catch((error) => console.error('Error:', error))

// Виконання запиту з кастомними токенами
fetchRequest('https://api.example.com/custom/resource', {}, { accessToken: 'customToken123' })
    .then((data) => console.log('Custom Token Response:', data))
    .catch((error) => console.error('Error:', error))
