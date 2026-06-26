import { migrate } from './db/migrate.js';
import { closePool } from './db/pool.js';
import { isUpdateProcessed, markUpdateProcessed } from './db/stateRepository.js';
import { TelegramClient } from './telegram/client.js';
import { TelegramLogger } from './telegram/logger.js';
import { OpenVkClient } from './openvk/client.js';
import { OpenVkPhotos } from './openvk/photos.js';
import { OpenVkWall } from './openvk/wall.js';
import { AvatarSync } from './sync/avatarSync.js';
import { PostSync } from './sync/postSync.js';
import { RetryWorker } from './sync/retryWorker.js';
import { config } from './config.js';
import { errorToString } from './utils/errors.js';
import { log } from './utils/log.js';

const bot = new TelegramClient();
const telegramLogger = new TelegramLogger(bot);
const openVkClient = new OpenVkClient();
const openVkPhotos = new OpenVkPhotos(openVkClient);
const openVkWall = new OpenVkWall(openVkClient);
const avatarSync = new AvatarSync({ bot, openVkPhotos, telegramLogger });
const postSync = new PostSync({ openVkWall, telegramLogger });
const retryWorker = new RetryWorker({ avatarSync, postSync, telegramLogger });

async function main() {
  await migrate();

  const pollingPromise = bot.startPolling(async (update) => {
    const updateId = update.update_id;
    const message = update.channel_post;
    if (!message) return;

    try {
      if (updateId && await isUpdateProcessed(updateId)) return;

      const handled = await avatarSync.handleChannelPost(message)
        || await postSync.handleChannelPost(message);
      if (handled && updateId) {
        await markUpdateProcessed(updateId);
      }
    } catch (error) {
      log.error('Failed to process channel_post', { error: errorToString(error) });
    }
  });
  retryWorker.start();

  await telegramLogger.info(
    `openvk-lk-sync started. Telegram channel=${config.telegram.channelId}, OpenVK owner_id=${config.openvk.ownerId}.`,
  );

  await pollingPromise;
}

async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down.`);
  retryWorker.stop();
  bot.stopPolling();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(async (error) => {
  log.error('Application failed to start', { error: errorToString(error) });
  try {
    await closePool();
  } finally {
    process.exit(1);
  }
});
