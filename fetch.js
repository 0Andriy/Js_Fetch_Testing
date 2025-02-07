// Надбудова над дефолтним fetch для модифікації відправки запиту і модифікації отриманої відповідітзь


// Інтерсептор для запитів
function fetchRequestInterceptor(url, options = {}, token = null, baseUrl = null) {
  // Дефолтний шаблон заголовків
  const defaultHeaders = {
      'Content-Type': 'application/json',
  }

  // Декомпозиція даних - url,
  const { method, headers, credentials, ...rest } = options;

  // Використання параметрів користувача або дефолтних значень, якщо користувач їх не задав
  const requestOptions = {
      // Метод запиту
      method: method || 'GET',
      // Заголовки (беремо дефолтні а потім перебиваємо користувацькими)
      headers: { ...defaultHeaders, ...headers },
      // Додавання параметру credentials (передача cookie)
      credentials: credentials || 'include',
      // Додаткові параметри від користувача (решта)
      ...rest 
  }


  // Додавання JWT токена до заголовків (якщо передано)
  if (token) {
      requestOptions.headers = {
          // Дістаємо дані, які вже є в headers
          ...requestOptions.headers,
          // Додаємо новий
          'Authorization': `Bearer ${token}`
      }

      // Або
      // requestOptions.headers.Authorization = `Bearer ${token}`
  }


  // Повний url запиту -- // const fullUrl = baseUrl ? `${baseUrl}${url}` : url
  let fullUrl = null
  // Додавання базового URL (якщо передано)
  if (baseUrl) {
      // fullUrl = `${baseUrl}${url}`
      fullUrl = baseUrl + url

  } else {
      fullUrl = url
  }

  // Вертаємо модифікановані параметри для запиту 
  return [fullUrl, requestOptions];
}



// Інтерсептор для відповідей -- ? (можливо переписати)
async function fetchResponseInterceptor(response) {
  // Перевірка статусу відповіді
  if (response.ok) {
      // У разі успішної відповіді розбираємо JSON
      const data = await response.json();
      // Повертаємо об'єкт з даними та повідомленням про успішність
      return { message: 'Success', data };
  } else {
      // У разі неуспішної відповіді повертаємо об'єкт з повідомленням про невдачу та причиною
      return { message: 'Failed', data: null, reason: response.statusText };
  }
}


// Функція для оновлення токенів через refreshToken
async function refreshTokens() {

}


// Функція-обгортка для fetch
async function $fetch(url, options = {}, isRetry = false) {
  try {
      //! Дістаємо accessToken
      const token = "ssss"

      // Виклик інтерсептора для запитів (вносимо модифікації перед запитом)
      const [finalUrl, finalOptions] = await fetchRequestInterceptor(url, options, token)

      // Виклик функції fetch (default) з модифікованими параметрами
      const response = await fetch(finalUrl, finalOptions)

      // Якщо отримано помилку з авторизацією і запит не повторний
      if (response.status === 401 && !isRetry) {
          // Оновлюємо токени через запит оновлення
          const refreshedToken = await refreshTokens() 

          //! Зберігаємо оновленні токени (accessToken)



          // передаємо true, щоб зробити помітку, що цей запит повторний
          return $fetch(url, options, true) 
      }

      // Повертаємо отриману відповідь результат
      return response

  } catch (err) {
      console.warn('Something went wrong !!', err)
      return { message: 'Failed', data: null, reason: err }
  }
}


export default $fetch


// process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

// const url = "https://172.19.176.1:3000/test";
// // const url = 'https://jsonplaceholder.typicode.com/todos/1'

// const response = await $fetch(url, {
//     method: "GET", // или 'PUT'
//     headers: {
//       "Content-Type": "application/json",
//     },
// });

// console.log(await response.json())