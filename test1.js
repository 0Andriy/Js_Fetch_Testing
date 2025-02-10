const BASE_URL = 'https://api.example.com';
let accessToken = 'initialAccessToken';
let refreshToken = 'initialRefreshToken';
let isRefreshing = false;
let refreshSubscribers = [];

const fetchWithTimeout = (url, options, timeout = 0) => {
    return new Promise((resolve, reject) => {
        const timer = timeout > 0 ? setTimeout(() => reject(new Error('Request timed out')), timeout) : null;
        fetch(url, options)
            .then(response => {
                if (timer) clearTimeout(timer);
                resolve(response);
            })
            .catch(err => {
                if (timer) clearTimeout(timer);
                reject(err);
            });
    });
};

const addQueryParams = (url, params) => {
    const urlObj = new URL(url);
    Object.keys(params).forEach(key => urlObj.searchParams.append(key, params[key]));
    return urlObj.toString();
};

const getTokens = () => {
    return { accessToken, refreshToken };
};

const setTokens = (newAccessToken, newRefreshToken) => {
    accessToken = newAccessToken;
    refreshToken = newRefreshToken;
};

const refreshTokens = async () => {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshToken}`
        }
    });
    if (!response.ok) throw new Error('Failed to refresh tokens');
    const data = await response.json();
    setTokens(data.accessToken, data.refreshToken);
    return data;
};

const onTokenRefreshed = (callback) => {
    refreshSubscribers.push(callback);
};

const notifySubscribers = (newAccessToken) => {
    refreshSubscribers.forEach(callback => callback(newAccessToken));
    refreshSubscribers = [];
};

const fetchWithAuth = async (url, options = {}, timeout = 0) => {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    };
    const finalOptions = { ...defaultOptions, ...options };

    try {
        const response = await fetchWithTimeout(url, finalOptions, timeout);
        if (response.status === 401) {
            if (!isRefreshing) {
                isRefreshing = true;
                try {
                    const newTokens = await refreshTokens();
                    notifySubscribers(newTokens.accessToken);
                    isRefreshing = false;
                } catch (error) {
                    isRefreshing = false;
                    throw error;
                }
            }
            return new Promise((resolve, reject) => {
                onTokenRefreshed(async (newAccessToken) => {
                    finalOptions.headers['Authorization'] = `Bearer ${newAccessToken}`;
                    try {
                        const retryResponse = await fetchWithTimeout(url, finalOptions, timeout);
                        resolve(retryResponse);
                    } catch (retryError) {
                        reject(retryError);
                    }
                });
            });
        }
        return response;
    } catch (error) {
        if (error.message === 'Failed to fetch') {
            throw new Error('Network error');
        }
        throw error;
    }
};

const handleResponse = async (response, customHandler) => {
    if (customHandler) {
        return customHandler(response);
    }
    return response.json();
};

const fetchData = async (url, options = {}, timeout = 0, responseHandler = null) => {
    try {
        const response = await fetchWithAuth(url, options, timeout);
        return await handleResponse(response, responseHandler);
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
};

export {
    addQueryParams,
    getTokens,
    setTokens,
    fetchData
};
