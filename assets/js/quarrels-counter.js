(() => {
  const card = document.querySelector('#quarrels');
  if (!card) return;
  const value = card.querySelector('[data-quarrels-value]');
  const unit = card.querySelector('[data-quarrels-unit]');
  const status = card.querySelector('[data-quarrels-status]');
  const historyList = card.querySelector('[data-quarrels-history]');
  const historyEmpty = card.querySelector('[data-quarrels-history-empty]');
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: 'long', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  let historySignature = null;
  const buttons = [...card.querySelectorAll('[data-quarrels-delta]')];
  const dataUrl = new URL(card.dataset.counterSource, document.baseURI);
  const configUrl = new URL('quarrels-config.json', dataUrl);
  const format = new Intl.NumberFormat('ru-RU');
  const plural = new Intl.PluralRules('ru-RU');
  const units = { one: 'ссора', few: 'ссоры', many: 'ссор', other: 'ссоры' };
  const actors = [...card.querySelectorAll('[data-quarrels-actor]')];
  let actor = null;
  let count = null;
  let pending = false;
  let apiUrl = null;

  function updateButtons() {
    buttons.forEach(button => {
      button.disabled = !apiUrl || !actor || pending || count === null ||
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

  function renderHistory(data) {
    if (!historyList || !historyEmpty) return;
    if (!Array.isArray(data.history)) return; // Compatible with the previous Worker during deployment.
    const events = data.history.filter(event =>
      Number.isSafeInteger(event.id) && Number.isSafeInteger(event.delta) &&
      Number.isSafeInteger(event.count_after) && event.count_after >= 0 &&
      typeof event.created_at === 'string' && Number.isFinite(Date.parse(event.created_at))
    );
    const signature = JSON.stringify(events);
    if (signature === historySignature) return;
    historySignature = signature;
    historyList.replaceChildren();
    historyEmpty.textContent = 'Здесь пока тихо ♡';
    historyEmpty.hidden = events.length > 0;
    events.forEach(event => {
      const row = document.createElement('li');
      row.className = 'quarrels-history-item';
      const badge = document.createElement('span');
      badge.className = 'quarrels-event-badge';
      badge.textContent = event.delta > 0 ? '+' + event.delta : String(event.delta).replace('-', '−');
      const copy = document.createElement('div');
      const title = document.createElement('span');
      title.className = 'quarrels-event-title';
      const name = { vitalya: 'Виталя', sonya: 'Соня' }[event.actor];
      title.textContent = (event.delta > 0 ? 'Добавлена ссора' : 'Счётчик уменьшен') + (name ? ' · ' + name : '');
      const time = document.createElement('time');
      const forgotten = event.id >= 1 && event.id <= 9 && event.delta > 0;
      if (!forgotten) time.dateTime = event.created_at;
      const date = new Date(event.created_at);
      time.textContent = forgotten ? 'время забыто, время утекло, окда)' : dateFormat.format(date) + ' · ' + timeFormat.format(date) + ' МСК';
      copy.append(title, time);
      const total = document.createElement('span');
      total.className = 'quarrels-event-total';
      total.textContent = 'Всего: ' + format.format(event.count_after);
      row.append(badge, copy, total);
      historyList.append(row);
    });
  }

  function render(data) {
    if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid counter');
    renderHistory(data);
    if (data.count !== count) {
      value.textContent = format.format(data.count);
      unit.textContent = units[plural.select(data.count)];
      value.classList.remove('counter-updated');
      requestAnimationFrame(() => value.classList.add('counter-updated'));
      count = data.count;
    }
  }

  async function refresh(delta = null) {
    if (pending || (delta !== null && (!apiUrl || !actor))) return;
    pending = true;
    updateButtons();
    try {
      const options = delta === null ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, actor }),
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

  actors.forEach(input => input.addEventListener('change', () => { actor = input.value; updateButtons(); }));
  buttons.forEach(button => button.addEventListener('click', () => refresh(Number(button.dataset.quarrelsDelta))));
  start();
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
