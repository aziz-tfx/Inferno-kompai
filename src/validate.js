// Валидация и нормализация данных, приходящих из формы лендинга.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Нормализует телефон: оставляет только цифры и ведущий «+».
 * @param {string} raw
 * @returns {string}
 */
export function normalizePhone(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Проверяет и приводит к нужному виду данные заявки.
 * @param {Object} body сырое тело запроса
 * @returns {{ ok: boolean, errors?: string[], data?: Object }}
 */
export function validateLead(body = {}) {
  const errors = [];

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = normalizePhone(body.phone);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const source = typeof body.source === 'string' ? body.source.trim() : '';

  if (!name) {
    errors.push('Укажите имя.');
  }

  // Должен быть хотя бы один способ связи.
  if (!phone && !email) {
    errors.push('Укажите телефон или email.');
  }

  if (phone) {
    const digitCount = phone.replace(/\D/g, '').length;
    if (digitCount < 10 || digitCount > 15) {
      errors.push('Некорректный номер телефона.');
    }
  }

  if (email && !EMAIL_RE.test(email)) {
    errors.push('Некорректный email.');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: { name, phone, email, message, source },
  };
}
