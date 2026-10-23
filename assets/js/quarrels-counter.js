/* Shared source of truth: assets/data/quarrels.json in this repository. */
(() => {
  const card = document.querySelector('#quarrels');
  if (!card) return;
  const value = card.querySelector('[data-quarrels-value]');
  const unit = card.querySelector('[data-quarrels-unit]');
  const status = card.querySelector('[data-quarrels-status]');
  const dataUrl = new URL(card.dataset.counterSource, document.baseURI);
  const numberFormat = new Intl.NumberFormat('ru-RU');
  const plural = new Intl.PluralRules('ru-RU');
  const units = { one: 'ссора', few: 'ссоры', many: 'ссор', other: 'ссоры' };
  let currentCount = null;
  let pending = false;

  async function refresh() {
    if (pending) return;
    pending = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(dataUrl, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Counter unavailable');
      const data = await response.json();
      if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid counter');
      if (data.count !== currentCount) {
        value.textContent = numberFormat.format(data.count);
        unit.textContent = units[plural.select(data.count)];
        value.classList.remove('counter-updated');
        requestAnimationFrame(() => value.classList.add('counter-updated'));
        currentCount = data.count;
      }
      status.textContent = '';
    } catch {
      status.textContent = currentCount === null
        ? 'Не получилось загрузить счётчик. Попробуйте обновить страницу.'
        : 'Не получилось обновить счётчик. Пока показываем последнее значение.';
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  }

  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
