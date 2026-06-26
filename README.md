# openvk-lk-sync

Minimal Telegram channel to OpenVK public page sync.

Current scope: when Telegram sends a channel avatar change event, the app downloads that avatar and sets it as the OpenVK public page avatar.

## Requirements

- Docker and Docker Compose.
- Telegram bot token.
- Bot added as an administrator to the source Telegram channel.
- OpenVK API token from a user that can edit the target public page.
- OpenVK owner id in API format, for example `-3084` for `club3084`.

## Configure

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:replace_me
TELEGRAM_CHANNEL_ID=-1001234567890
TELEGRAM_LOG_CHAT_ID=

OPENVK_BASE_URL=https://api.openvk.org
OPENVK_ACCESS_TOKEN=replace_me
OPENVK_OWNER_ID=-3084

DATABASE_URL=postgres://openvk_sync:openvk_sync@postgres:5432/openvk_sync
RETRY_DELAY_MS=3600000
LOG_LEVEL=info
```

`TELEGRAM_LOG_CHAT_ID` is optional. If set, the bot sends system notifications there.

`TELEGRAM_CHANNEL_ID` can be numeric, such as `-1001234567890`. The code is also structured to tolerate username-style config later, but numeric id is the recommended value for private channels.

## Run

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f app
```

Stop:

```bash
docker compose down
```

Keep database data while rebuilding:

```bash
docker compose up -d --build
```

Remove database data:

```bash
docker compose down -v
```

## How It Works

1. The app uses Telegram long polling.
2. It listens for `channel_post` updates.
3. If the update contains `new_chat_photo`, it downloads the largest photo size from Telegram.
4. It calls OpenVK:
   - `photos.getOwnerPhotoUploadServer` with `owner_id=OPENVK_OWNER_ID`
   - uploads multipart field `photo` to `upload_url`
   - `photos.saveOwnerPhoto` with `photo` and `hash`
5. If OpenVK upload/save fails, it stores a retry job in Postgres and retries after `RETRY_DELAY_MS`.

## Verifying Telegram Events

After starting the app:

1. Make sure the bot is an administrator in the Telegram channel.
2. Change the channel avatar.
3. Check `docker compose logs -f app`.
4. If `TELEGRAM_LOG_CHAT_ID` is set, check that chat for system notifications.

Expected log message:

```text
Telegram channel avatar changed. Syncing to OpenVK...
OpenVK avatar updated for owner_id=-3084.
```

If no event arrives, Telegram is not delivering avatar change service messages to the bot in that channel setup. This app intentionally does not poll `getChat` for avatar changes.

Only one consumer can use `getUpdates` for the same bot token. If another process or webhook is active for this bot, stop it or remove the webhook before running this service.
