class FetchInterceptor {
    constructor({ baseUrl, getToken, refreshToken, onAuthFailure }) {
        this.baseUrl = baseUrl
        this.getToken = getToken
        this.refreshToken = refreshToken
        this.onAuthFailure = onAuthFailure
        this.tokenRefreshing = false
        this.pendingRequests = []
    }

    buildUrl(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}${endpoint}`)
        Object.keys(params).forEach((key) => url.searchParams.append(key, params[key]))
        return url.toString()
    }

    async request(endpoint, options = {}) {
        let accessToken = await this.getToken()

        const defaultOptions = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        }

        if (accessToken) {
            defaultOptions.headers['Authorization'] = `Bearer ${accessToken}`
        }

        options = {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers },
        }

        return this.fetchWithInterceptors(endpoint, options)
    }

    async fetchWithInterceptors(endpoint, options) {
        try {
            let response = await fetch(this.buildUrl(endpoint), options)
            if (response.status === 401) {
                return this.handleUnauthorizedRequest(endpoint, options)
            }
            return this.handleResponse(response)
        } catch (error) {
            return this.handleError(error)
        }
    }

    async handleUnauthorizedRequest(endpoint, options) {
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
            this.pendingRequests.push(() => resolve(this.fetchWithInterceptors(endpoint, options)))
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

export default FetchInterceptor

// ==============================
// Приклад використання
// ==============================

const api = new FetchInterceptor({
    baseUrl: 'https://api.example.com',
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

// Виконання GET-запиту
api.request('/user/profile')
    .then((data) => console.log('User Profile:', data))
    .catch((error) => console.error('Error:', error))

// Виконання POST-запиту
api.request('/user/update', {
    method: 'POST',
    body: JSON.stringify({ name: 'New Name' }),
})
    .then((data) => console.log('Update Success:', data))
    .catch((error) => console.error('Error:', error))
