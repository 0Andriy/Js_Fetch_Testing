// Функція для перевірки, чи токен ще дійсний
// function isTokenExpired(accessToken) {
//     if (!accessToken) return true;

//     const payload = JSON.parse(atob(accessToken.split('.')[1])); // Декодуємо payload JWT
//     console.log(payload)
//     const currentTime = Math.floor(Date.now() / 1000); // Поточний час у секундах
//     return currentTime >= payload.exp; // Порівнюємо поточний час з часом закінчення дії токена
// }

function isTokenExpired(token) {
    if (!token) return true
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        console.log(payload, payload.exp, payload.exp * 1000)
        return Date.now() >= payload.exp * 1000
        // or return Math.floor(Date.now() / 1000) >= payload.exp
    } catch (error) {
        return true // Якщо токен не валідний
    }
}

const a = isTokenExpired(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
)
console.log(a)
