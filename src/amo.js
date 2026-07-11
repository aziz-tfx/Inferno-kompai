// Клиент amoCRM: создание сделки (лида) вместе с контактом одним запросом
// через метод /api/v4/leads/complex.
// Документация: https://www.amocrm.ru/developers/content/crm_platform/leads-api

const BASE_URL = (process.env.AMO_BASE_URL || '').replace(/\/+$/, '');
const ACCESS_TOKEN = process.env.AMO_ACCESS_TOKEN || '';

const PIPELINE_ID = toIntOrUndefined(process.env.AMO_PIPELINE_ID);
const STATUS_ID = toIntOrUndefined(process.env.AMO_STATUS_ID);
const RESPONSIBLE_USER_ID = toIntOrUndefined(process.env.AMO_RESPONSIBLE_USER_ID);

function toIntOrUndefined(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Проверяет, что обязательные переменные окружения заданы.
 * Бросает ошибку с понятным сообщением, если конфигурация неполная.
 */
export function assertAmoConfigured() {
  if (!BASE_URL) {
    throw new Error('Не задан AMO_BASE_URL (адрес аккаунта amoCRM).');
  }
  if (!ACCESS_TOKEN) {
    throw new Error('Не задан AMO_ACCESS_TOKEN (долгосрочный токен доступа amoCRM).');
  }
}

function amoHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };
}

/**
 * Создаёт сделку и связанный контакт в amoCRM.
 *
 * @param {Object} lead
 * @param {string} lead.name        Имя клиента
 * @param {string} [lead.phone]     Телефон
 * @param {string} [lead.email]     Email
 * @param {string} [lead.message]   Комментарий/сообщение клиента
 * @param {number} [lead.price]     Бюджет сделки
 * @param {string} [lead.leadName]  Название сделки (по умолчанию — «Заявка с лендинга»)
 * @param {string} [lead.source]    Источник (например, URL страницы)
 * @returns {Promise<{leadId: number, contactId: number|null}>}
 */
export async function createLeadWithContact(lead) {
  assertAmoConfigured();

  const contactFields = [];

  if (lead.phone) {
    contactFields.push({
      field_code: 'PHONE',
      values: [{ value: lead.phone, enum_code: 'WORK' }],
    });
  }
  if (lead.email) {
    contactFields.push({
      field_code: 'EMAIL',
      values: [{ value: lead.email, enum_code: 'WORK' }],
    });
  }

  const contact = { name: lead.name || 'Клиент' };
  if (contactFields.length > 0) {
    contact.custom_fields_values = contactFields;
  }
  if (RESPONSIBLE_USER_ID) {
    contact.responsible_user_id = RESPONSIBLE_USER_ID;
  }

  const leadObject = {
    name: lead.leadName || 'Заявка с лендинга',
    _embedded: { contacts: [contact] },
  };

  if (Number.isFinite(lead.price)) leadObject.price = lead.price;
  if (PIPELINE_ID) leadObject.pipeline_id = PIPELINE_ID;
  if (STATUS_ID) leadObject.status_id = STATUS_ID;
  if (RESPONSIBLE_USER_ID) leadObject.responsible_user_id = RESPONSIBLE_USER_ID;

  const url = `${BASE_URL}/api/v4/leads/complex`;
  const response = await fetch(url, {
    method: 'POST',
    headers: amoHeaders(),
    body: JSON.stringify([leadObject]),
  });

  const rawBody = await response.text();

  if (!response.ok) {
    // amoCRM возвращает детали ошибки в теле ответа — пробрасываем их для логов.
    throw new Error(
      `amoCRM ответил статусом ${response.status}: ${rawBody || '(пустое тело)'}`
    );
  }

  let parsed;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : [];
  } catch {
    throw new Error(`Не удалось разобрать ответ amoCRM: ${rawBody}`);
  }

  // Ответ complex-метода — массив созданных сделок с id лида и контактов.
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const leadId = first?.id ?? null;
  const contactId =
    first?.contact_id ?? first?._embedded?.contacts?.[0]?.id ?? null;

  // Комментарий клиента и источник добавляем отдельным примечанием к сделке.
  // Делаем это best-effort: если примечание не создалось, сам лид уже есть,
  // поэтому ошибку только логируем, но не роняем весь запрос.
  const noteParts = [];
  if (lead.message) noteParts.push(`Сообщение: ${lead.message}`);
  if (lead.source) noteParts.push(`Источник: ${lead.source}`);

  if (leadId && noteParts.length > 0) {
    try {
      await addLeadNote(leadId, noteParts.join('\n'));
    } catch (err) {
      console.error('Не удалось добавить примечание к сделке', leadId, err.message);
    }
  }

  return { leadId, contactId };
}

/**
 * Добавляет текстовое примечание к сделке.
 * @param {number} leadId
 * @param {string} text
 */
export async function addLeadNote(leadId, text) {
  const url = `${BASE_URL}/api/v4/leads/${leadId}/notes`;
  const response = await fetch(url, {
    method: 'POST',
    headers: amoHeaders(),
    body: JSON.stringify([
      { note_type: 'common', params: { text } },
    ]),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`amoCRM (примечание) ответил статусом ${response.status}: ${body}`);
  }
}
