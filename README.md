# gamelive

Telegram Mini App MVP: создание персонажа и игровой todo-лист с квестами.

## Локальный запуск

1. Скопируйте пример окружения и заполните секреты:

```bash
cp .env.example .env
```

2. Укажите `TELEGRAM_BOT_TOKEN` и `JWT_SECRET`.
3. Для локальной разработки без Telegram можно включить `DEV_AUTH=true`.
4. Запустите контейнеры:

```bash
docker compose up -d
```

Приложение будет доступно на `http://localhost:3000`.

### Dev-auth режим

Если включён `DEV_AUTH=true`, на главной странице доступна кнопка **Dev вход**,
а также API `POST /api/auth/dev` (использует фиктивного пользователя).

## Полезные команды

Просмотр логов приложения:

```bash
docker compose logs -f app
```

## Архитектура

- `server.js` — REST API и валидация Telegram `initData`.
- `schema.sql` — схема PostgreSQL.
- `public/` — минимальный фронтенд (страницы `/`, `/character.html`, `/game.html`).
- `public/assets` — PNG-слои персонажа (512×768, прозрачный фон) и `catalog.json`.

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

## Paper-doll редактор

Редактор персонажа использует PNG-слои в папке `public/assets` и сохраняет ID ассетов
(например `hair_short_black`) в полях `hair_style`, `hair_color`, `outfit_top`,
`outfit_bottom`, `outfit_shoes`.

### Каталог ассетов

Файл `public/assets/catalog.json` описывает доступные ассеты и используется
клиентом и сервером для построения UI и валидации. PNG-файлы будут добавлены
в соответствующие папки командой проекта после merge.

Ожидаемая структура ассетов (PNG, 512×768, прозрачный фон):

```
public/assets/
  catalog.json
  base/
    base_01.png
  hair/
    hair_short_black.png
    hair_long_black.png
  top/
    top_hoodie.png
    top_tshirt.png
  bottom/
    bottom_jeans.png
    bottom_shorts.png
  shoes/
    shoes_sneakers.png
    shoes_boots.png
```

### Manual test checklist

1. `cp .env.example .env` и установите `DEV_AUTH=true`.
2. `docker compose up -d`.
3. Откройте `http://localhost:3000` и нажмите **Dev вход**.
4. Перейдите в редактор персонажа:
   - отображается paper-doll превью;
   - выбор прически/одежды меняет превью;
   - сохранение персонажа переводит на `/game.html`.
5. Создайте квест, отметьте выполнение и проверьте начисление XP/уровня.
