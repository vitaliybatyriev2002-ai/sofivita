# Общее число ссор: подключение с телефона

Фронтенд остаётся на GitHub Pages. Cloudflare Worker принимает нажатия,
а D1 хранит одно число для всех устройств. Параллельные нажатия складываются
атомарно. Ниже нуля счётчик не уходит.

## 1. База

В Cloudflare открой Storage & databases → D1 → Create database.
Имя: `sofivita-quarrels`.
В Console созданной базы выполни содержимое `schema.sql` из этой папки.
При необходимости перед первым запуском укажи там текущее число вместо 0.
Повторный запуск INSERT OR IGNORE не сбрасывает существующий счётчик.

## 2. Worker

Workers & Pages → Create application → Create Worker (или Hello World).
Имя: `sofivita-counter`. Создай Worker, затем Edit code.
Замени код на содержимое `worker.mjs` из этой папки и нажми Deploy.
В Worker открой Bindings → Add binding → D1 database.
Variable name: `DB`. Выбери базу `sofivita-quarrels` и сохрани.

## 3. Подключить сайт

Скопируй адрес Worker вида https://sofivita-counter.ВАШ-АККАУНТ.workers.dev.
Открой его с добавленным `/counter`: должен появиться JSON с count.
В `assets/data/quarrels-config.json` укажи этот полный URL:

```json
{"apiUrl":"https://sofivita-counter.ВАШ-АККАУНТ.workers.dev/counter"}
```

После публикации GitHub Pages кнопки станут активными. Нажми + на одном
телефоне и проверь второй: значение обновляется каждые 15 секунд и при
возврате на вкладку. На нуле кнопка − отключена.

## Как это работает

GET /counter возвращает число. POST /counter с JSON {"delta":1} или
{"delta":-1} меняет его на единицу. Кнопки доступны посетителям сайта;
личная авторизация не предусмотрена. CORS разрешает sofivita.ru,
www.sofivita.ru и страницы владельца на github.io; это ограничение браузера,
а не защита от прямых запросов к API.

До подключения API сайт читает старое общее число из quarrels.json,
а кнопки отключены. После подключения источником числа становится D1;
редактирование quarrels.json больше не меняет активный счётчик.

Документация: https://developers.cloudflare.com/d1/get-started/
