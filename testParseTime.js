/**
 * Парсить дату та час із заданого рядка відповідно до формату.
 * Повертає timestamp (кількість секунд з 1970-01-01 00:00:00 UTC).
 *
 * @param {string} dateString - Вхідний рядок з датою та часом.
 * @param {string} format - Формат рядка (за замовчуванням "dd.mm.yyyy hh24:mi:ss").
 * @returns {number} - Unix timestamp у секундах.
 * @throws {Error} - Якщо формат не відповідає рядку або дата некоректна.
 */
function parseDateTime(dateString, format = 'dd.mm.yyyy hh24:mi:ss') {
    // Мапа форматів до відповідних регулярних виразів
    const formatMap = {
        dd: '(\\d{2})', // День (двозначне число)
        mm: '(\\d{2})', // Місяць (двозначне число)
        yyyy: '(\\d{4})', // Рік (чотиризначне число)
        yy: '(\\d{2})', // Двозначний рік (буде конвертовано в повний)
        hh24: '(\\d{2})', // Година у 24-годинному форматі (двозначне число)
        mi: '(\\d{2})', // Хвилини (двозначне число)
        ss: '(\\d{2})', // Секунди (двозначне число)
    }

    // Об'єкт з дефолтними значеннями (якщо якісь значення відсутні у рядку)
    let dateParts = {
        dd: 1, // День за замовчуванням
        mm: 1, // Місяць за замовчуванням
        yyyy: 1970, // Рік за замовчуванням
        hh24: 0, // Година за замовчуванням
        mi: 0, // Хвилини за замовчуванням
        ss: 0, // Секунди за замовчуванням
    }

    // Замінюємо частини формату на їх відповідні регулярні вирази
    let regexPattern = format.replace(/dd|mm|yyyy|yy|hh24|mi|ss/g, (match) => formatMap[match])

    // console.log('Final Regex Pattern with Delimiters:', regexPattern) // Лог для перевірки фінального шаблону

    // Створюємо регулярний вираз
    let regex = new RegExp('^' + regexPattern + '$')

    // Виконуємо пошук збігів у введеному рядку
    let match = dateString.match(regex)

    // console.log('Match Result:', match) // Лог для перевірки збігів

    // Якщо формат не збігається, викидаємо помилку
    if (!match) {
        throw new Error('Date string does not match the given format')
    }

    // Отримуємо всі частини формату в порядку, як вони йдуть у переданому форматі
    let formatParts = format.match(/dd|mm|yyyy|yy|hh24|mi|ss/g)

    // Присвоюємо знайдені значення до `dateParts`
    formatParts.forEach((part, index) => {
        dateParts[part] = parseInt(match[index + 1], 10)
    })

    // Якщо у форматі є "yy", але немає "yyyy", конвертуємо у повний рік
    if (format.includes('yy') && !format.includes('yyyy')) {
        dateParts['yyyy'] = 2000 + dateParts['yy'] // Додаємо 2000 до двозначного року
    }

    // Створюємо об'єкт Date (місяці в JavaScript починаються з 0)
    let date = new Date(
        dateParts['yyyy'], // Рік
        dateParts['mm'] - 1, // Місяць (мінус 1, оскільки JS використовує 0-індексацію)
        dateParts['dd'], // День
        dateParts['hh24'], // Години
        dateParts['mi'], // Хвилини
        dateParts['ss'], // Секунди
    )

    // Перевіряємо, чи дійсно введена дата існує (наприклад, 32.01.2025 є недійсною)
    if (date.getDate() !== dateParts['dd'] || date.getMonth() + 1 !== dateParts['mm']) {
        throw new Error('Invalid date')
    }

    // Повертаємо timestamp у секундах
    return Math.floor(date.getTime() / 1000)
}

// Приклади використання:
console.log(parseDateTime('12.02.2025 21:48:56', 'dd.mm.yyyy hh24:mi:ss')) // 1739389736
console.log(parseDateTime('01-12-24 14:30', 'dd-mm-yy hh24:mi')) // 1733056200
console.log(parseDateTime('2025/02/12 23-59-59', 'yyyy/mm/dd hh24-mi-ss')) // 1739397599
