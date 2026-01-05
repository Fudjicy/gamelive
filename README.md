# gamelive

Telegram Mini App MVP: создание персонажа и игровой todo-лист с квестами.

## Локальный запуск

1. Скопируйте пример окружения и заполните секреты:

```bash
cp .env.example .env
```

2. Укажите `TELEGRAM_BOT_TOKEN` и `JWT_SECRET`.
3. Запустите контейнеры:

```bash
docker compose up -d
```

Приложение будет доступно на `http://localhost:3000`.

## Полезные команды

Просмотр логов приложения:

```bash
docker compose logs -f app
```

## Архитектура

- `server.js` — REST API и валидация Telegram `initData`.
- `schema.sql` — схема PostgreSQL.
- `public/` — минимальный фронтенд (страницы `/`, `/character.html`, `/game.html`).

## API (MVP)

- `POST /api/auth/telegram` — авторизация через initData.
- `GET /api/character` — получить персонажа.
- `POST /api/character` — создать/обновить персонажа.
- `GET /api/quests?status=active|done`
- `POST /api/quests`
- `PATCH /api/quests/:id`
- `DELETE /api/quests/:id`
- `POST /api/quests/:id/complete`
- `POST /api/quests/:id/steps`
- `PATCH /api/steps/:id`
- `DELETE /api/steps/:id`
