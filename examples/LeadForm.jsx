// Пример формы для Next.js (App Router) на Vercel.
//
// 1. Скопируйте public/amo-bridge.js в папку public/ вашего Next-проекта.
// 2. Подключите скрипт моста (через next/script) и используйте этот компонент.
//
// Мост сам создаёт скрытую amo-форму и отправляет данные через amoforms.js.

'use client';

import { useState } from 'react';
import Script from 'next/script';

export default function LeadForm() {
  const [status, setStatus] = useState({ type: 'idle', text: '' });
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    const email = f.email.value.trim();
    const message = f.message.value.trim();

    if (!name) return setStatus({ type: 'err', text: 'Укажите имя.' });
    if (!phone && !email)
      return setStatus({ type: 'err', text: 'Укажите телефон или email.' });

    setSending(true);
    setStatus({ type: 'idle', text: 'Отправляем…' });

    try {
      // window.AmoBridge появляется после загрузки amo-bridge.js.
      const res = await window.AmoBridge.submit({ name, phone, email, message });
      setStatus({
        type: 'ok',
        text: res.confirmed ? 'Спасибо! Заявка отправлена.' : 'Заявка принята.',
      });
      f.reset();
    } catch (err) {
      setStatus({ type: 'err', text: 'Не удалось отправить. Попробуйте ещё раз.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Мост к встроенной веб-форме amoCRM */}
      <Script src="/amo-bridge.js" strategy="afterInteractive" />

      <form onSubmit={handleSubmit}>
        <input name="name" type="text" placeholder="Имя" autoComplete="name" required />
        <input name="phone" type="tel" placeholder="Телефон" autoComplete="tel" />
        <input name="email" type="email" placeholder="Email" autoComplete="email" />
        <textarea name="message" placeholder="Комментарий" rows={3} />
        <button type="submit" disabled={sending}>
          {sending ? 'Отправка…' : 'Отправить'}
        </button>
        {status.text && (
          <p style={{ color: status.type === 'err' ? '#e53935' : '#43a047' }}>
            {status.text}
          </p>
        )}
      </form>
    </>
  );
}
