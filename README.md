# openvk-lk-sync

Minimal Telegram channel to OpenVK public page sync.

Current scope:

- when Telegram sends a channel avatar change event, the app downloads that avatar and sets it as the OpenVK public page avatar;
- when a text or photo post appears in the Telegram channel, the app publishes it to the OpenVK public page wall;
- Telegram photo albums are collected briefly and published as one OpenVK post with multiple photo attachments;
- when a Telegram text post is a reply to an already synced Telegram post, the app publishes it as an OpenVK repost with a comment.

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
MEDIA_GROUP_SETTLE_MS=2500
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

Cancel all pending post retries, useful after manually confirming that old failed image-only posts were already published:

```bash
docker compose exec postgres psql -U openvk_sync -d openvk_sync \
  -c "update retry_jobs set status = 'cancelled', updated_at = now() where status = 'pending' and type in ('post_sync', 'post_text_sync');"
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

Post flow:

1. The app receives a `channel_post` update.
2. If it contains `text`, `caption`, or `photo`, and is not a service message, it prepares an OpenVK wall post.
3. Photo files are downloaded from Telegram, uploaded through `photos.getWallUploadServer`, and saved through `photos.saveWallPhoto`.
4. The post is published to `OPENVK_OWNER_ID` with `from_group=1` and photo attachments when present.
5. The app stores `telegram_chat_id + telegram_message_id -> openvk_owner_id + openvk_post_id` in Postgres.
6. If OpenVK returns an error, it stores a retry job and retries after `RETRY_DELAY_MS`.

Telegram media group flow:

1. Telegram sends albums as multiple `channel_post` updates with the same `media_group_id`.
2. The app waits `MEDIA_GROUP_SETTLE_MS` after the latest item.
3. It publishes the collected photos as one OpenVK post.
4. The app stores `telegram_chat_id + telegram_message_id -> openvk_owner_id + openvk_post_id` in Postgres.
   Every Telegram message id from the album maps to the same OpenVK post id.

Reply flow:

1. The app receives a `channel_post` with `reply_to_message`.
2. It looks up the replied Telegram message in `post_mappings`.
3. If a mapping exists, it calls `wall.repost` with `object=wall<openvk_owner_id>_<openvk_post_id>` and uses the Telegram reply text/caption and photos as the repost comment/attachments.
4. If no mapping exists, it publishes the Telegram reply as a normal OpenVK wall post.
5. The new OpenVK post id is stored in `post_mappings`.

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

For a text post, expected log message:

```text
Telegram post 123 published to OpenVK wall-3084_456.
```

If no event arrives, Telegram is not delivering avatar change service messages to the bot in that channel setup. This app intentionally does not poll `getChat` for avatar changes.

Only one consumer can use `getUpdates` for the same bot token. If another process or webhook is active for this bot, stop it or remove the webhook before running this service.
