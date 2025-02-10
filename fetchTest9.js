class HttpClient {
    constructor(baseURL, options = {}) {
        this.baseURL = baseURL
        this.defaultHeaders = options.headers || {}
        this.token = localStorage.getItem('token')
        this.refreshToken = localStorage.getItem('refreshToken')
        this.refreshingToken = false
        this.pendingRequests = []
    }

    async request(url, options = {}) {
        let fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`
        let config = {
            ...options,
            headers: { ...this.defaultHeaders, ...options.headers },
        }

        // Додаємо токен до заголовків
        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`
        }

        try {
            let response = await fetch(fullUrl, config)

            if (response.status === 401) {
                return this.handleUnauthorizedRequest(config, fullUrl)
            }

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`)
            }

            return response.json()
        } catch (error) {
            console.error('Fetch error:', error)
            throw error
        }
    }

    async handleUnauthorizedRequest(config, url) {
        if (!this.refreshingToken) {
            this.refreshingToken = true

            try {
                const newToken = await this.refreshAccessToken()
                this.token = newToken
                localStorage.setItem('token', newToken)

                this.pendingRequests.forEach(({ resolve }) =>
                    resolve(this.retryRequest(url, config)),
                )
                this.pendingRequests = []
            } catch (error) {
                this.pendingRequests.forEach(({ reject }) => reject(error))
                this.pendingRequests = []
                throw error
            } finally {
                this.refreshingToken = false
            }
        }

        return new Promise((resolve, reject) => {
            this.pendingRequests.push({ resolve, reject })
        })
    }

    async refreshAccessToken() {
        console.log('Оновлення токена...')
        const response = await fetch(`${this.baseURL}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
        })

        if (!response.ok) {
            throw new Error('Не вдалося оновити токен')
        }

        const data = await response.json()
        return data.token
    }

    async retryRequest(url, config) {
        config.headers['Authorization'] = `Bearer ${this.token}`
        const response = await fetch(url, config)
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`)
        }
        return response.json()
    }

    get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' })
    }

    post(url, body, options = {}) {
        return this.request(url, { ...options, method: 'POST', body: JSON.stringify(body) })
    }

    put(url, body, options = {}) {
        return this.request(url, { ...options, method: 'PUT', body: JSON.stringify(body) })
    }

    delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' })
    }
}

// Використання:
const api = new HttpClient('https://api.example.com')

// Виклик запиту
api.get('/data')
    .then((data) => console.log('Отримані дані:', data))
    .catch((error) => console.error('Помилка:', error))
