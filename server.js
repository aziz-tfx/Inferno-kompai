import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLeadWithContact, assertAmoConfigured } from './src/amo.js';
import { validateLead } from './src/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS ---
// Список разрешённых доменов лендинга берём из CORS_ORIGINS (через запятую).
const corsOriginsRaw = (process.env.CORS_ORIGINS || '*').trim();
const corsOptions =
  corsOriginsRaw === '*' || corsOriginsRaw === ''
    ? { origin: true }
    : {
        origin: corsOriginsRaw.split(',').map((o) => o.trim()).filter(Boolean),
      };

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Пример формы (public/index.html) — удобно для проверки интеграции.
app.use(express.static(path.join(__dirname, 'public')));

// Health-check.
app.get('/health', (_req, res) => {
  let amoConfigured = true;
  try {
    assertAmoConfigured();
  } catch {
    amoConfigured = false;
  }
  res.json({ status: 'ok', amoConfigured });
});

// Приём заявки с лендинга → создание сделки + контакта в amoCRM.
app.post('/api/lead', async (req, res) => {
  const result = validateLead(req.body);
  if (!result.ok) {
    return res.status(400).json({ ok: false, errors: result.errors });
  }

  try {
    const { leadId, contactId } = await createLeadWithContact({
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      message: result.data.message,
      source: result.data.source || req.get('referer') || '',
    });

    console.log(`Лид создан в amoCRM: lead=${leadId}, contact=${contactId}`);
    return res.status(201).json({ ok: true, leadId, contactId });
  } catch (err) {
    console.error('Ошибка при отправке лида в amoCRM:', err.message);
    return res.status(502).json({
      ok: false,
      error: 'Не удалось отправить заявку в amoCRM. Попробуйте позже.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  try {
    assertAmoConfigured();
    console.log('amoCRM: конфигурация загружена.');
  } catch (err) {
    console.warn(`amoCRM: внимание — ${err.message}`);
  }
});
