import { config } from '../config.js';
import { downloadTelegramFile } from '../telegram/files.js';
import { enqueueRetry } from '../db/retryRepository.js';
import { getState, setState } from '../db/stateRepository.js';
import { isConfiguredChannel } from '../telegram/channel.js';
import { errorToString } from '../utils/errors.js';

const LAST_AVATAR_UNIQUE_ID = 'last_avatar_unique_id';

export class AvatarSync {
  constructor({ bot, openVkPhotos, telegramLogger }) {
    this.bot = bot;
    this.openVkPhotos = openVkPhotos;
    this.telegramLogger = telegramLogger;
  }

  async handleChannelPost(message) {
    if (!isConfiguredChannel(message.chat)) return false;
    if (!Array.isArray(message.new_chat_photo) || message.new_chat_photo.length === 0) return false;

    const photoSize = message.new_chat_photo[message.new_chat_photo.length - 1];
    await this.syncTelegramPhotoSize(photoSize, {
      source: 'telegram_event',
      telegramMessageId: message.message_id,
    });

    return true;
  }

  async retry(payload) {
    const file = await downloadTelegramFile(this.bot, payload.fileId);
    await this.uploadDownloadedFile(file, payload);
  }

  async syncTelegramPhotoSize(photoSize, context) {
    const lastSyncedUniqueId = await getState(LAST_AVATAR_UNIQUE_ID);
    if (lastSyncedUniqueId === photoSize.file_unique_id) {
      await this.telegramLogger.info('Telegram channel avatar event received, avatar already synced.');
      return;
    }

    await this.telegramLogger.info('Telegram channel avatar changed. Syncing to OpenVK...');

    try {
      const file = await downloadTelegramFile(this.bot, photoSize.file_id);
      await this.uploadDownloadedFile(file, {
        fileId: photoSize.file_id,
        fileUniqueId: photoSize.file_unique_id,
        ...context,
      });
    } catch (error) {
      await this.scheduleRetry({
        fileId: photoSize.file_id,
        fileUniqueId: photoSize.file_unique_id,
        ...context,
      }, error);
    }
  }

  async uploadDownloadedFile(file, payload) {
    await this.openVkPhotos.setOwnerAvatarFromBuffer(file.buffer, file.filePath);
    await setState(LAST_AVATAR_UNIQUE_ID, payload.fileUniqueId ?? file.uniqueId ?? payload.fileId);
    await this.telegramLogger.info(`OpenVK avatar updated for owner_id=${config.openvk.ownerId}.`);
  }

  async scheduleRetry(payload, error) {
    const runAfter = new Date(Date.now() + config.retryDelayMs);
    await enqueueRetry('avatar_sync', payload, runAfter);
    await this.telegramLogger.error(
      `OpenVK avatar sync failed. Retry scheduled at ${runAfter.toISOString()}. ${errorToString(error)}`,
    );
  }

}
