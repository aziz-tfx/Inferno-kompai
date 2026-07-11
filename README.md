# Inferno — отправка лида в amoCRM

Бэкенд принимает заявку с формы лендинга и создаёт в amoCRM **сделку (лид) + контакт**
одним запросом через метод [`/api/v4/leads/complex`](https://www.amocrm.ru/developers/content/crm_platform/leads-api).
Авторизация — по **долгосрочному токену** (long-lived access token).

## Как это работает

```
Форма на лендинге  ──POST /api/lead──▶  Node.js/Express  ──▶  amoCRM API
     (name, phone,                        валидация           Сделка + Контакт
      email, message)                                         (+ примечание)
```

## Установка

```bash
npm install
cp .env.example .env
# заполните .env своими значениями
npm start
```

Сервер поднимется на `http://localhost:3000`. Там же по адресу `/` открывается
демо-форма (`public/index.html`) — удобно проверить интеграцию.

## Настройка amoCRM

1. В amoCRM: **Настройки → Интеграции → Создать интеграцию** (внешняя).
2. Откройте созданную интеграцию → вкладка **«Ключи и доступы»**.
3. Скопируйте **долгосрочный токен доступа** → в `.env` как `AMO_ACCESS_TOKEN`.
4. Адрес аккаунта (например `https://inferno.amocrm.ru`) → в `.env` как `AMO_BASE_URL`.

Переменные окружения (см. `.env.example`):

| Переменная                 | Обязательна | Описание                                              |
|----------------------------|-------------|-------------------------------------------------------|
| `AMO_BASE_URL`             | да          | Адрес аккаунта amoCRM, без слэша в конце              |
| `AMO_ACCESS_TOKEN`         | да          | Долгосрочный токен доступа                            |
| `AMO_PIPELINE_ID`          | нет         | ID воронки для сделки                                 |
| `AMO_STATUS_ID`            | нет         | ID статуса (этапа) в воронке                          |
| `AMO_RESPONSIBLE_USER_ID`  | нет         | ID ответственного за сделку/контакт                  |
| `PORT`                     | нет         | Порт сервера (по умолчанию 3000)                     |
| `CORS_ORIGINS`             | нет         | Домены лендинга через запятую (или `*` для всех)     |

## API

### `POST /api/lead`

Тело запроса (JSON):

```json
{
  "name": "Иван",
  "phone": "+79001234567",
  "email": "ivan@example.com",
  "message": "Интересует услуга",
  "source": "https://inferno-kompai.ru/"
}
```

- `name` — обязательно.
- Нужен хотя бы один способ связи: `phone` **или** `email`.
- `message`, `source` — необязательны (уходят в примечание к сделке).

Успех — `201`:

```json
{ "ok": true, "leadId": 123456, "contactId": 654321 }
```

Ошибка валидации — `400`:

```json
{ "ok": false, "errors": ["Укажите имя."] }
```

Ошибка amoCRM — `502`:

```json
{ "ok": false, "error": "Не удалось отправить заявку в amoCRM. Попробуйте позже." }
```

### `GET /health`

Проверка живости и наличия конфигурации amoCRM:

```json
{ "status": "ok", "amoConfigured": true }
```

## Подключение своей формы

Отправляйте `POST` на `/api/lead` с полями `name`, `phone`, `email`, `message`, `source`.
Пример на чистом JS — в `public/index.html`. Если фронт живёт на другом домене,
укажите этот домен в `CORS_ORIGINS`.

## Проверка через curl

```bash
curl -X POST http://localhost:3000/api/lead \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","phone":"+79001234567","message":"проверка"}'
```
