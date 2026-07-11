/*
 * amo-diagnose.js — самодиагностика интеграции с amoCRM-формой.
 *
 * Как пользоваться (на ЗАДЕПЛОЕННОЙ странице лендинга, где есть доступ к amocrm.ru):
 *
 *   Вариант A. Подключить временно:
 *     <script src="/amo-diagnose.js"></script>
 *     затем в консоли:  amoDiagnose()
 *
 *   Вариант B. Просто открыть консоль (F12 → Console), вставить содержимое
 *     этого файла целиком и нажать Enter — диагностика запустится сама.
 *
 * Скрипт грузит вашу amo-форму, определяет способ рендера (HTML или iframe),
 * показывает поля, делает ТЕСТОВУЮ отправку и по шагам пишет, что произошло.
 * Отправляется реальная заявка — в amoCRM появится тестовая сделка (можно удалить).
 */
(function (global) {
  'use strict';

  var CONFIG = {
    formId: '1729890',
    hash: '8cec8b72e4941c9a590219d4bb7cc61a',
    locale: 'ru',
    scriptSrc: 'https://forms.amocrm.ru/forms/assets/js/amoforms.js',
    testData: {
      name: 'ТЕСТ Диагностика',
      phone: '+79001234567',
      email: 'test-diagnose@example.com',
      message: 'Тестовая заявка (диагностика интеграции)',
    },
  };

  function log(step, msg, data) {
    var prefix = '%c[amo-diagnose]%c ' + step;
    if (data !== undefined) {
      console.log(prefix, 'color:#ff5722;font-weight:bold', 'color:inherit', msg, data);
    } else {
      console.log(prefix, 'color:#ff5722;font-weight:bold', 'color:inherit', msg);
    }
  }
  function ok(msg, data) { log('✓', msg, data); }
  function warn(msg, data) { console.warn('[amo-diagnose] ⚠', msg, data !== undefined ? data : ''); }
  function fail(msg, data) { console.error('[amo-diagnose] ✗', msg, data !== undefined ? data : ''); }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function injectForm(container) {
    (function (a, m, o, c, r, mm) {
      a[o + c] = a[o + c] || { setMeta: function (p) { this.params = (this.params || []).concat([p]); } };
      a[o + r] = a[o + r] || function (f) { a[o + r].f = (a[o + r].f || []).concat([f]); };
      a[o + r]({ id: CONFIG.formId, hash: CONFIG.hash, locale: CONFIG.locale });
      a[o + mm] = a[o + mm] || function (f, k) { a[o + mm].f = (a[o + mm].f || []).concat([f, k]); };
    })(global, 0, 'amo_forms_', 'params', 'load', 'loaded');

    var s = document.createElement('script');
    s.id = 'amoforms_script_diag_' + CONFIG.formId;
    s.async = true;
    s.charset = 'utf-8';
    s.src = CONFIG.scriptSrc + '?' + Date.now();
    container.appendChild(s);
  }

  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? global.HTMLTextAreaElement.prototype : global.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    ['input', 'change', 'keyup', 'blur'].forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }

  async function run() {
    console.log('%c=== amoCRM: диагностика интеграции ===', 'font-size:14px;font-weight:bold;color:#ff5722');
    log('1', 'Аккаунт: azizcollab.amocrm.ru, form_id=' + CONFIG.formId);

    // Проверка сети до forms.amocrm.ru.
    try {
      await fetch(CONFIG.scriptSrc + '?ping=' + Date.now(), { mode: 'no-cors' });
      ok('2', 'Сеть до forms.amocrm.ru отвечает (скрипт формы доступен).');
    } catch (e) {
      fail('2', 'Не удалось обратиться к forms.amocrm.ru — форма не загрузится.', e && e.message);
    }

    // Грузим форму в видимый контейнер (чтобы amo-валидация точно отработала).
    var container = document.createElement('div');
    container.id = 'amo-diag-container';
    container.style.cssText = 'position:fixed;right:8px;bottom:8px;width:320px;max-height:60vh;overflow:auto;z-index:2147483647;background:#fff;border:2px solid #ff5722;padding:8px;box-shadow:0 8px 30px rgba(0,0,0,.3)';
    document.body.appendChild(container);
    log('3', 'Загружаю amo-форму…');
    injectForm(container);

    // Ждём появления формы или iframe.
    var started = Date.now();
    var form = null, iframe = null;
    while (Date.now() - started < 15000) {
      form = container.querySelector('form');
      iframe = container.querySelector('iframe');
      if ((form && form.querySelector('input, textarea')) || iframe) break;
      await sleep(200);
    }

    if (iframe && !form) {
      fail('4', 'Форма отрендерилась в IFRAME (' + (iframe.src || 'без src') + ').');
      warn('   Это значит: поля формы на другом домене (amocrm.ru), и из-за политики');
      warn('   cross-origin мост НЕ может их заполнить. Нужен другой способ интеграции');
      warn('   (прямой POST или серверный API). Сообщите мне этот результат.');
      return { render: 'iframe', canBridge: false };
    }

    if (!form) {
      fail('4', 'Форма не появилась за 15 сек. Проверьте: не блокирует ли форму настройка');
      warn('   доменов в amoCRM, нет ли ошибок сети/адблокера в консоли выше.');
      return { render: 'none', canBridge: false };
    }

    ok('4', 'Форма отрендерилась как HTML в странице — мост применим.');

    // Показываем поля.
    var inputs = Array.prototype.slice.call(form.querySelectorAll('input, textarea')).filter(function (el) {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].indexOf(t) === -1;
    });
    var fieldInfo = inputs.map(function (el, i) {
      var field = el.closest('.amoforms__field');
      var label = field && field.querySelector('.amoforms__field-name, label');
      return {
        i: i, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '',
        label: label ? (label.textContent || '').trim() : '',
        required: el.required || (field && /required|_required/.test(field.className)),
      };
    });
    log('5', 'Поля формы (' + fieldInfo.length + '):');
    console.table(fieldInfo);

    // Заполняем и отправляем тестовые данные.
    log('6', 'Заполняю тестовыми данными и отправляю…', CONFIG.testData);
    inputs.forEach(function (el) {
      var t = (el.getAttribute('type') || '').toLowerCase();
      var hints = ((el.name || '') + ' ' + (el.placeholder || '') + ' ' + t).toLowerCase();
      var field = el.closest('.amoforms__field');
      var label = field ? (field.textContent || '').toLowerCase() : '';
      var all = hints + ' ' + label;
      if (t === 'tel' || /phone|tel|тел|моб|номер/.test(all)) setValue(el, CONFIG.testData.phone);
      else if (t === 'email' || /email|mail|почт/.test(all)) setValue(el, CONFIG.testData.email);
      else if (el.tagName === 'TEXTAREA' || /коммент|сообщ|message|comment/.test(all)) setValue(el, CONFIG.testData.message);
      else setValue(el, CONFIG.testData.name);
    });

    var btn = form.querySelector('.amoforms__submit button') || form.querySelector('button[type="submit"]') || form.querySelector('[type="submit"]');
    if (!btn) { fail('7', 'Кнопка отправки не найдена в форме.'); return { render: 'html', canBridge: true, submitted: false }; }
    btn.click();
    ok('7', 'Кнопка «Отправить» нажата. Жду ответ amoCRM (до 15 сек)…');

    // Ждём «спасибо» или ошибки валидации.
    started = Date.now();
    var verdict = 'timeout';
    while (Date.now() - started < 15000) {
      var thanks = container.querySelector('.amoforms__thanks, .amoforms__success, [class*="thank"], [class*="success"]');
      var errors = container.querySelectorAll('.amoforms__field-error, .error, [class*="error"]');
      var visibleErrors = Array.prototype.filter.call(errors, function (e) { return e.offsetParent !== null && (e.textContent || '').trim(); });
      if (thanks) { verdict = 'thanks'; break; }
      if (visibleErrors.length) {
        verdict = 'validation';
        fail('8', 'amoCRM показала ошибки валидации — заявка НЕ отправлена:');
        visibleErrors.forEach(function (e) { warn('   • ' + (e.textContent || '').trim()); });
        break;
      }
      await sleep(300);
    }

    if (verdict === 'thanks') {
      ok('8', 'Успех! amoCRM показала «Спасибо» — тестовая заявка отправлена.');
      ok('   Проверьте воронку в amoCRM: там должна появиться сделка «ТЕСТ Диагностика».');
    } else if (verdict === 'timeout') {
      fail('8', 'За 15 сек не появилось ни «Спасибо», ни ошибок. Возможные причины:');
      warn('   • домен лендинга не разрешён в настройках формы amoCRM;');
      warn('   • сработал адблокер/трекинг-защита (см. ошибки выше);');
      warn('   • обязательное поле формы не было заполнено (см. таблицу полей).');
    }

    log('9', 'Готово. Скопируйте весь вывод консоли и пришлите мне.');
    return { render: 'html', canBridge: true, verdict: verdict, fields: fieldInfo };
  }

  global.amoDiagnose = run;

  // Автозапуск, если файл вставлен в консоль напрямую.
  if (!global.__amoDiagnoseNoAuto) {
    run();
  }
})(window);
