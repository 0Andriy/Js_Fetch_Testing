// Глобальна змінна для зберігання інтерцепторів
let requestInterceptors = [];

// Функція для реєстрації інтерцепторів
const addRequestInterceptor = (interceptor) => {
    requestInterceptors.push(interceptor);
};

// Обгортка $fetch з інтерцептором для дефолтних параметрів
const $fetch = async (url, options = {}) => {
    // Інтерцептор за замовчуванням з усіма можливими параметрами
    const defaultOptions = {
        method: 'GET', // метод запиту, за замовчуванням GET
        headers: {
            'Content-Type': 'application/json', // Заголовок для JSON тіла
        },
        body: null, // Тіло запиту (тіло можна передати в параметрах)
        cache: 'default', // Кешування запиту, дефолтний режим - 'default' (інші можливі варіанти: 'no-cache', 'reload', 'force-cache', 'only-if-cached')
        credentials: 'same-origin', // Відправка cookie та авторизаційних заголовків для запитів, які йдуть на той самий домен (інші варіанти: 'omit', 'include')
        mode: 'cors', // Режим доступу до ресурсу: 'cors', 'no-cors', 'same-origin'
        redirect: 'follow', // Як обробляти редиректи: 'follow', 'manual', 'error'
        referrerPolicy: 'no-referrer', // Політика реферера для запиту
        timeout: 5000, // Тайм-аут для запиту в мілісекундах (не є частиною стандарту fetch, але можна реалізувати за допомогою додаткової логіки)
        signal: null, // Сигнал для скасування запиту через AbortController
    };

    // Якщо є токен в локальному сховищі, додаємо його в заголовки
    const token = "AccessToken" || localStorage.getItem('token');
    if (token) {
        defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    // Перебираємо інтерцептори і модифікуємо запит
    for (const interceptor of requestInterceptors) {
        const modified = await interceptor({ url, options, defaultOptions });
        url = modified.url || url;
        options = { ...defaultOptions, ...modified.options };
    }

    const finalOptions = { ...defaultOptions, ...options };

    try {
        const response = await fetch(url, finalOptions);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Unknown error');
        }

        return response.json(); // Повертаємо JSON з відповіді
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
};

// Приклад використання

// Реєстрація інтерцептора для додавання кастомних заголовків або налаштувань
addRequestInterceptor(async ({ options }) => {
    // Можна додавати кастомні заголовки або параметри
    if (options.addCustomHeader) {
        options.headers['X-Custom-Header'] = options.addCustomHeader;
    }
    return { options };
});

// Приклад виклику $fetch
const fetchData = async () => {
    try {
        const response = await $fetch('https://jsonplaceholder.typicode.com/todos/1', {
            method: 'GET', // Користувацький метод (можна змінювати)
            addCustomHeader: 'MyCustomHeaderValue', // Кастомний заголовок
            headers: { 'Custom-Header': 'CustomValue' }, // Користувацькі заголовки
        });
        console.log(response);
    } catch (err) {
        console.error(err);
    }
};

fetchData();
