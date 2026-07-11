/*
 * amo-bridge.js — мост между вашей формой на лендинге и встроенной веб-формой amoCRM.
 *
 * Идея: на страницу подгружается СКРЫТАЯ веб-форма amoCRM (её родной скрипт amoforms.js).
 * Когда пользователь отправляет ВАШУ видимую форму, мост копирует значения в поля
 * скрытой amo-формы и нажимает её кнопку отправки. Реальную отправку в amoCRM
 * выполняет официальный код amo — значит правила воронки, уведомления и валидация
 * работают штатно, а бэкенд и токены не нужны.
 *
 * Параметры вашей формы (из кода размещения в amoCRM):
 *   Аккаунт : azizcollab.amocrm.ru
 *   Form ID : 1729890
 *   Hash    : 8cec8b72e4941c9a590219d4bb7cc61a
 *
 * Подключение:
 *   1. Вставьте <script src="/amo-bridge.js"></script> перед </body>.
 *   2. Вызовите AmoBridge.init() один раз (или он сам инициализируется, см. ниже).
 *   3. При сабмите вашей формы вызовите AmoBridge.submit({name, phone, email, message}).
 */
(function (global) {
  'use strict';

  var CONFIG = {
    formId: '1729890',
    hash: '8cec8b72e4941c9a590219d4bb7cc61a',
    locale: 'ru',
    scriptSrc: 'https://forms.amocrm.ru/forms/assets/js/amoforms.js',
    containerId: 'amo-hidden-form',
    // Сколько ждём готовности скрытой формы и её отправки (мс).
    readyTimeout: 15000,
    submitTimeout: 15000,
  };

  var state = { injected: false, containerEl: null };

  // --- Загрузка скрытой amo-формы ------------------------------------------

  function ensureContainer() {
    var el = document.getElementById(CONFIG.containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = CONFIG.containerId;
      el.setAttribute('aria-hidden', 'true');
      // Уводим за пределы экрана, но НЕ display:none — иначе валидация amo может не сработать.
      el.style.cssText =
        'position:absolute!important;left:-99999px!important;top:0!important;' +
        'width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
      document.body.appendChild(el);
    }
    return el;
  }

  function injectAmoForm() {
    if (state.injected) return;
    state.injected = true;
    var container = ensureContainer();
    state.containerEl = container;

    // Регистрируем параметры формы (аналог инлайн-скрипта из кода размещения amoCRM).
    (function (a, m, o, c, r, mm) {
      a[o + c] =
        a[o + c] ||
        {
          setMeta: function (p) {
            this.params = (this.params || []).concat([p]);
          },
        };
      a[o + r] =
        a[o + r] ||
        function (f) {
          a[o + r].f = (a[o + r].f || []).concat([f]);
        };
      a[o + r]({ id: CONFIG.formId, hash: CONFIG.hash, locale: CONFIG.locale });
      a[o + mm] =
        a[o + mm] ||
        function (f, k) {
          a[o + mm].f = (a[o + mm].f || []).concat([f, k]);
        };
    })(window, 0, 'amo_forms_', 'params', 'load', 'loaded');

    var s = document.createElement('script');
    s.id = 'amoforms_script_' + CONFIG.formId;
    s.async = true;
    s.charset = 'utf-8';
    s.src = CONFIG.scriptSrc + '?' + Date.now();
    // Важно: скрипт должен находиться внутри контейнера, чтобы форма отрендерилась в нём.
    container.appendChild(s);
  }

  // --- Ожидание готовности формы -------------------------------------------

  function getAmoForm() {
    var c = state.containerEl || document.getElementById(CONFIG.containerId);
    if (!c) return null;
    var form = c.querySelector('form');
    if (!form) return null;
    // Форма считается готовой, когда в ней появились поля ввода.
    var hasInputs = form.querySelector('input, textarea, select');
    return hasInputs ? form : null;
  }

  function waitForForm(timeout) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function poll() {
        var form = getAmoForm();
        if (form) return resolve(form);
        if (Date.now() - started > timeout) {
          return reject(new Error('amo-форма не загрузилась вовремя'));
        }
        setTimeout(poll, 150);
      })();
    });
  }

  // --- Заполнение полей -----------------------------------------------------

  // Нативно выставляем значение, чтобы сработали слушатели amoforms.js (React-подобные).
  function setValue(el, value) {
    var proto =
      el.tagName === 'TEXTAREA'
        ? global.HTMLTextAreaElement.prototype
        : global.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    ['input', 'change', 'keyup', 'blur'].forEach(function (type) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  function fieldText(input) {
    // Собираем «подсказки» о назначении поля: name, placeholder, тип, текст ярлыка.
    var parts = [
      input.getAttribute('name') || '',
      input.getAttribute('placeholder') || '',
      input.getAttribute('type') || '',
      input.getAttribute('autocomplete') || '',
    ];
    var field = input.closest('.amoforms__field');
    if (field) {
      var label = field.querySelector('.amoforms__field-name, label');
      if (label) parts.push(label.textContent || '');
    }
    return parts.join(' ').toLowerCase();
  }

  function match(hints, keywords) {
    return keywords.some(function (k) {
      return hints.indexOf(k) !== -1;
    });
  }

  // Раскладываем значения по инпутам скрытой формы, каждый инпут используем один раз.
  function fillForm(form, data) {
    var inputs = Array.prototype.slice.call(
      form.querySelectorAll('input, textarea')
    ).filter(function (el) {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].indexOf(t) === -1;
    });

    var used = [];
    var filled = { name: false, phone: false, email: false, message: false };

    function assign(kind, matcher) {
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (used.indexOf(el) !== -1) continue;
        if (matcher(el)) {
          setValue(el, data[kind]);
          used.push(el);
          filled[kind] = true;
          return;
        }
      }
    }

    if (data.phone) {
      assign('phone', function (el) {
        var t = (el.getAttribute('type') || '').toLowerCase();
        return t === 'tel' || match(fieldText(el), ['phone', 'tel', 'тел', 'моб', 'номер']);
      });
    }
    if (data.email) {
      assign('email', function (el) {
        var t = (el.getAttribute('type') || '').toLowerCase();
        return t === 'email' || match(fieldText(el), ['email', 'mail', 'почт', 'e-mail']);
      });
    }
    if (data.name) {
      assign('name', function (el) {
        return match(fieldText(el), ['name', 'имя', 'фио', 'как вас', 'contact']);
      });
    }
    if (data.message) {
      assign('message', function (el) {
        return (
          el.tagName === 'TEXTAREA' ||
          match(fieldText(el), ['коммент', 'сообщ', 'message', 'comment', 'вопрос'])
        );
      });
    }

    // Фолбэк: если имя не нашли по подсказкам — берём первый свободный текстовый инпут.
    if (data.name && !filled.name) {
      assign('name', function (el) {
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        return t === 'text' || t === '';
      });
    }

    return filled;
  }

  // --- Отправка -------------------------------------------------------------

  function clickSubmit(form) {
    var btn =
      form.querySelector('.amoforms__submit button') ||
      form.querySelector('button[type="submit"]') ||
      form.querySelector('input[type="submit"]') ||
      form.querySelector('.amoforms__submit');
    if (btn) {
      btn.click();
      return true;
    }
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return true;
    }
    return false;
  }

  // amoCRM после успешной отправки заменяет форму на «спасибо».
  // Ждём появления этого признака, чтобы подтвердить доставку.
  function waitForThanks(container, timeout) {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function poll() {
        var thanks = container.querySelector(
          '.amoforms__thanks, .amoforms__success, [class*="thank"], [class*="success"]'
        );
        var formGone = !container.querySelector('form input, form textarea');
        if (thanks || formGone) return resolve(true);
        if (Date.now() - started > timeout) return resolve(false);
        setTimeout(poll, 200);
      })();
    });
  }

  // --- Публичный API --------------------------------------------------------

  var api = {
    init: function (options) {
      if (options) {
        for (var k in options) {
          if (Object.prototype.hasOwnProperty.call(options, k)) CONFIG[k] = options[k];
        }
      }
      injectAmoForm();
      // Прогреваем форму заранее, чтобы к моменту сабмита она уже была готова.
      waitForForm(CONFIG.readyTimeout).catch(function () {});
      return api;
    },

    /**
     * Отправляет данные в amoCRM через скрытую форму.
     * @param {{name?:string, phone?:string, email?:string, message?:string}} data
     * @returns {Promise<{ok:boolean, confirmed:boolean}>}
     */
    submit: function (data) {
      injectAmoForm();
      var container = state.containerEl;
      return waitForForm(CONFIG.readyTimeout).then(function (form) {
        fillForm(form, data || {});
        var submitted = clickSubmit(form);
        if (!submitted) {
          throw new Error('Не удалось нажать кнопку отправки в amo-форме');
        }
        return waitForThanks(container, CONFIG.submitTimeout).then(function (confirmed) {
          // Форму нужно переинициализировать для следующей отправки.
          if (confirmed) {
            state.injected = false;
            if (container) container.innerHTML = '';
          }
          return { ok: true, confirmed: confirmed };
        });
      });
    },

    /**
     * Диагностика: показывает, какие поля отдала amo-форма и как мост их
     * сопоставит. Запускать в консоли браузера на странице с формой:
     *   AmoBridge.inspect().then(console.table)
     * @returns {Promise<Array<{index:number, tag:string, type:string, name:string,
     *   placeholder:string, label:string, matchedAs:string}>>}
     */
    inspect: function () {
      injectAmoForm();
      return waitForForm(CONFIG.readyTimeout).then(function (form) {
        var inputs = Array.prototype.slice
          .call(form.querySelectorAll('input, textarea'))
          .filter(function (el) {
            var t = (el.getAttribute('type') || 'text').toLowerCase();
            return (
              ['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].indexOf(t) === -1
            );
          });

        return inputs.map(function (el, i) {
          var hints = fieldText(el);
          var t = (el.getAttribute('type') || '').toLowerCase();
          var matchedAs = '(не распознано → фолбэк «имя»)';
          if (t === 'tel' || match(hints, ['phone', 'tel', 'тел', 'моб', 'номер'])) {
            matchedAs = 'phone';
          } else if (t === 'email' || match(hints, ['email', 'mail', 'почт', 'e-mail'])) {
            matchedAs = 'email';
          } else if (match(hints, ['name', 'имя', 'фио', 'как вас', 'contact'])) {
            matchedAs = 'name';
          } else if (
            el.tagName === 'TEXTAREA' ||
            match(hints, ['коммент', 'сообщ', 'message', 'comment', 'вопрос'])
          ) {
            matchedAs = 'message';
          }
          var field = el.closest('.amoforms__field');
          var label = field && field.querySelector('.amoforms__field-name, label');
          return {
            index: i,
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            name: el.getAttribute('name') || '',
            placeholder: el.getAttribute('placeholder') || '',
            label: label ? (label.textContent || '').trim() : '',
            matchedAs: matchedAs,
          };
        });
      });
    },
  };

  global.AmoBridge = api;

  // Автоинициализация после загрузки DOM.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      api.init();
    });
  } else {
    api.init();
  }
})(window);
