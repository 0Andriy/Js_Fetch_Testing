// // Функція для перетворення об'єкта параметрів в query-стрічку, з уникненням дублювання
// function buildQueryString(url = '', params = {}) {
//     if (Object.keys(params).length === 0) return url; // Якщо немає параметрів, повертаємо оригінальний URL

//     // Створюємо об'єкт URL для зручного доступу до його частин
//     const urlObj = new URL(url);

//     // Перетворюємо існуючі параметри в URLSearchParams
//     const existingParams = new URLSearchParams(urlObj.search);

//     // Оновлюємо існуючі параметри новими, замінюючи їх за потребою
//     for (const [key, value] of Object.entries(params)) {
//         existingParams.set(key, value);  // set замінює значення, якщо такий параметр вже існує
//     }

//     // Повертаємо нову query-стрічку з оновленими параметрами
//     const newQueryString = existingParams.toString();

//     // Якщо є нові параметри, повертаємо їх
//     return newQueryString ? `?${newQueryString}` : '';
// }


// // Функція для перетворення об'єкта параметрів в новий url з query параметрами, з уникненням дублювання
// function updateUrlWithParams(url = '', params = {}) {
//     if (Object.keys(params).length === 0) return url; // Якщо немає параметрів, повертаємо оригінальний URL

//     // Створюємо об'єкт URL для зручного доступу до його частин
//     const urlObj = new URL(url);

//     // Перетворюємо існуючі параметри в URLSearchParams
//     const existingParams = new URLSearchParams(urlObj.search);

//     // Оновлюємо існуючі параметри новими, замінюючи їх за потребою
//     for (const [key, value] of Object.entries(params)) {
//         existingParams.set(key, value);  // set замінює значення, якщо такий параметр вже існує
//     }

//     // Оновлюємо параметри у URL
//     urlObj.search = existingParams.toString(); // Перезаписуємо query-стрічку

//     // Повертаємо повністю оновлений URL
//     return urlObj.toString();
// }



// === Універсальні функції для URL ===

// Універсальна функція для роботи з параметрами URL
function updateParamsInUrl(url, params) {
    const urlObj = new URL(url);
    const existingParams = new URLSearchParams(urlObj.search);

    Object.entries(params).forEach(([key, value]) => existingParams.set(key, value));

    return existingParams.toString();
}


// Функція для перетворення об'єкта параметрів в новий URL з query параметрами
function updateUrlWithParams(url = '', params = {}) {
    if (Object.keys(params).length === 0) return url;

    const queryString = updateParamsInUrl(url, params);
    return queryString ? `${url.split('?')[0]}?${queryString}` : url;
}


// Функція інтерсептора запиту
async function RequestInterceptor (url = '', options = {}, data = null, params = {}, token = null) {
    // Формуємо фінальний url для запиту
    const finalUrl = updateUrlWithParams(url, params);

    // Дефолтні заголовки
    const defaultHeaders = {
        'Content-Type': 'application/json', // Для передачі JSON // Заголовок для JSON тіла
        // 'Accept': 'application/json', // Прийом JSON-відповіді
    };

    // Якщо є токен в локальному сховищі, додаємо його в заголовки
    // const token = localStorage.getItem('token');
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;

        // defaultHeaders = {
        //     // Дістаємо дані, які вже є в defaultHeaders
        //     ...defaultHeaders,
        //     // Додаємо нові
        //     'Authorization': `Bearer ${token}`
        // }
    }

    // Об'єднуємо дефолтні заголовки з тими, що приходять у параметрах
    const mergedHeaders = { ...defaultHeaders, ...options.headers };

    // Інтерцептор за замовчуванням з усіма можливими параметрами
    const defaultOptions = {
        method: 'GET', // метод запиту, за замовчуванням GET
        headers: mergedHeaders,
        body: null, // Тіло запиту (тіло можна передати в параметрах)
        cache: 'default', // Кешування запиту, дефолтний режим - 'default' (інші можливі варіанти: 'no-cache', 'reload', 'force-cache', 'only-if-cached')
        credentials: 'same-origin', // Відправка cookie та авторизаційних заголовків для запитів, які йдуть на той самий домен (інші варіанти: 'omit', 'include')
        mode: 'cors', // Режим доступу до ресурсу: 'cors', 'no-cors', 'same-origin'
        redirect: 'follow', // Як обробляти редиректи: 'follow', 'manual', 'error'
        referrerPolicy: 'no-referrer', // Політика реферера для запиту
        timeout: 5000, // Тайм-аут для запиту в мілісекундах (не є частиною стандарту fetch, але можна реалізувати за допомогою додаткової логіки)
        signal: null, // Сигнал для скасування запиту через AbortController
    };


    // Об'єднуємо дефолтні налаштування з тими, що приходять у параметрах
    const mergedOptions= { ...defaultOptions, ...options };
    
    // Якщо body ще не передано, додаємо його тільки для відповідних методів
    if (!options.body && data && ['POST', 'PUT', 'PATCH'].includes(mergedOptions.method.toUpperCase())) {
        mergedOptions.body = JSON.stringify(data); // Додаємо body лише для методів, які підтримують його
    }


    return [finalUrl, mergedOptions]
}


// Функція обробки відповіді
async function ResponseInterceptor (response, type = "json") {
    if (!response.ok) {
        // Перевірка на помилку (наприклад, 404 або 500)
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    try {
        // Обробка відповіді в залежності від типу
        switch (type) {
            case 'json':
                return await response.json();  // Повертає JSON-об'єкт
            case 'text':
                return await response.text();  // Повертає текст
            case 'blob':
                return await response.blob();  // Повертає Blob (наприклад, для файлів)
            case 'formData':
                return await response.formData();  // Повертає FormData (для передачі файлів через форми)
            default:
                throw new Error(`Unsupported response type: ${type}`);
        }
    } catch (error) {
        console.error('Failed to parse response:', error);
        throw new Error(`Failed to process response: ${error.message}`);
    }
}




// === Управління токенами ===

// Отримання токена (accessToken) з локального сховища або іншого джерела
function getAccessToken() {
    const token = localStorage.getItem('accessToken');
    return token || null;
}


// Оновлення токенів через refreshToken
async function updateTokens() {
    try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            throw new Error('Refresh token is missing');
        }

        const response = await fetch('/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
            throw new Error(`Failed to refresh tokens: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.accessToken && data.refreshToken) {
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            return data.accessToken;
        } else {
            throw new Error('Invalid response from token refresh endpoint');
        }
    } catch (error) {
        console.error('Error refreshing tokens:', error);
        throw error;
    }
}


// === Обгортка $fetch ===

// Обгортка $fetch
async function $fetch (url, options = {}, {data = null, params = {}, responseType = 'json', isRetry = true} = {}) {
    try {
        // Якщо є токен в локальному сховищі, додаємо його в заголовки
        const token = "tok123" || getAccessToken();

        // Викликаємо інтерцептор на модифікацію запиту перед його відправкою
        const [ urlModif, optionsModif ] = await RequestInterceptor(url, options, data, params, token)

        // Виконуємо дефолтний fetch запит але із модифікованими даними
        const response = await fetch(urlModif, optionsModif)

        // Якщо отримано помилку з авторизацією і запит не повторний
        if (response.status === 401 && !isRetry) {
            console.warn('Access token expired. Refreshing tokens...');
            // Оновлюємо токени через запит оновлення
            const refreshedToken = "refreshToken"

            //! Зберігаємо оновленні токени 


            // передаємо true, щоб зробити помітку, що цей запит повторний
            return $fetch(url, options, { data, params, responseType, isRetry: true }) 
        }


        if (!responseType) {
            // Якщо потрібно, просто повертаємо response без обробки
            return response;
        }


        // Викликаємо інтерсептора для обробки отриманої відповіді
        const result = await ResponseInterceptor(response, responseType)


        // Вертаємо остаточний результат назад
        return result
        

    } catch (error) {
        // Обробка помилок, наприклад, відсутність інтернет-з'єднання або неуспішний fetch
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            // Якщо помилка стосується відсутності з'єднання
            console.error('Network error: Please check your internet connection.');
        } else {
            console.error('Fetch error:', error);
        }

        throw error;  // Прокидуємо помилку далі для обробки в іншому місці
    }

}



export default $fetch



// === Тестування ===

// Перевірка, чи файл запущений напряму
if (import.meta.url === new URL('', import.meta.url).href) {
    (async () => {
        console.log('Запуск тестів...');

        // Ініціалізація тестових токенів
        // localStorage.setItem('accessToken', 'testAccessToken');
        // localStorage.setItem('refreshToken', 'testRefreshToken');

        try {
            // Тест оновлення токенів
            console.log('Тест: Оновлення токенів...');
            // const newToken = await updateTokens();
            // console.log('Новий токен:', newToken);

            // Тест запиту через $fetch
            console.log('Тест: Виконання запиту через $fetch...');
            const response = await $fetch('https://jsonplaceholder.typicode.com/posts/1', {
                method: 'GET',
            });
            console.log('Результат запиту:', response);

        } catch (error) {
            console.error('Помилка при тестуванні:', error);
        }
    })
    
    // ();
}



// $fetch('https://jsonplaceholder.typicode.com/posts/1')
// .then((data) => console.log(data))


// $fetch('https://jsonplaceholder.typicode.com/todos/1', {}, {
//     params: {
//         postId: 1
//     }
// }).then((data) => console.log(data))




// $fetch('https://jsonplaceholder.typicode.com/posts', {
//     method: "post"
// }, {
//     data: {
//         user: "admin",
//         password: "123456"
//     },
//     responseType: null
// })
// .then(response => response.json())
// .then((data) => console.log(data))




