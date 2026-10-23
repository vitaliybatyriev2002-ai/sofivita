(() => {
  const card = document.querySelector('#quarrels');
  if (!card) return;
  const value = card.querySelector('[data-quarrels-value]');
  const unit = card.querySelector('[data-quarrels-unit]');
  const status = card.querySelector('[data-quarrels-status]');
  const buttons = [...card.querySelectorAll('[data-quarrels-delta]')];
  const dataUrl = new URL(card.dataset.counterSource, document.baseURI);
  const configUrl = new URL('quarrels-config.json', dataUrl);
  const format = new Intl.NumberFormat('ru-RU');
  const plural = new Intl.PluralRules('ru-RU');
  const units = { one: 'ссора', few: 'ссоры', many: 'ссор', other: 'ссоры' };
  let count = null;
  let pending = false;
  let apiUrl = null;

  function updateButtons() {
    buttons.forEach(button => {
      button.disabled = !apiUrl || pending || count === null ||
        (button.dataset.quarrelsDelta === '-1' && count === 0) ||
        (button.dataset.quarrelsDelta === '1' && count === Number.MAX_SAFE_INTEGER);
    });
    card.setAttribute('aria-busy', String(pending));
  }

  async function read(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Counter unavailable');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  function render(data) {
    if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid counter');
    if (data.count !== count) {
      value.textContent = format.format(data.count);
      unit.textContent = units[plural.select(data.count)];
      value.classList.remove('counter-updated');
      requestAnimationFrame(() => value.classList.add('counter-updated'));
      count = data.count;
    }
  }

  async function refresh(delta = null) {
    if (pending || (delta !== null && !apiUrl)) return;
    pending = true;
    updateButtons();
    try {
      const options = delta === null ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      };
      render(await read(apiUrl || dataUrl, options));
      status.textContent = apiUrl ? '' : 'Кнопки скоро заработают ♡';
    } catch {
      status.textContent = delta !== null
        ? 'Не удалось подтвердить изменение. Обновите счётчик перед следующим нажатием.'
        : 'Не получилось обновить счётчик. Попробуйте чуть позже.';
      // Never guess a new total or repeat a write after an ambiguous network error.
      if (delta !== null) count = null;
    } finally {
      pending = false;
      updateButtons();
    }
  }

  async function start() {
    try {
      const config = await read(configUrl);
      if (typeof config.apiUrl === 'string' && config.apiUrl.trim()) {
        const url = new URL(config.apiUrl);
        if (url.protocol !== 'https:') throw new Error('HTTPS required');
        apiUrl = url;
      }
    } catch { /* Read repository count until setup is complete. */ }
    await refresh();
  }

  buttons.forEach(button => button.addEventListener('click', () => refresh(Number(button.dataset.quarrelsDelta))));
  start();
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
