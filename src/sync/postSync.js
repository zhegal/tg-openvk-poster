import { config } from '../config.js';
import { cancelPendingRetriesForTelegramMessages, enqueueRetry } from '../db/retryRepository.js';
import { findPostMapping, savePostMappings } from '../db/postRepository.js';
import { isConfiguredChannel } from '../telegram/channel.js';
import { downloadTelegramFile } from '../telegram/files.js';
import { errorToString } from '../utils/errors.js';

export class PostSync {
  constructor({ bot, openVkPhotos, openVkWall, telegramLogger }) {
    this.bot = bot;
    this.openVkPhotos = openVkPhotos;
    this.openVkWall = openVkWall;
    this.telegramLogger = telegramLogger;
    this.mediaGroups = new Map();
  }

  async handleChannelPost(message) {
    if (!isConfiguredChannel(message.chat)) return false;
    if (this.isServiceMessage(message)) return false;

    const text = this.extractText(message);
    const photoFileId = this.extractLargestPhotoFileId(message);
    if (!text && !photoFileId) return false;

    if (message.media_group_id) {
      this.collectMediaGroupMessage(message, { text, photoFileId });
      return true;
    }

    const existing = await findPostMapping(message.chat.id, message.message_id);
    if (existing) {
      return true;
    }

    await this.publishPost({
      telegramChatId: message.chat.id,
      telegramMessageIds: [message.message_id],
      replyToTelegramMessageId: message.reply_to_message?.message_id ?? null,
      text,
      photoFileIds: photoFileId ? [photoFileId] : [],
      source: 'telegram_event',
    });

    return true;
  }

  async retry(payload) {
    await this.publishPost(payload, { scheduleOnFailure: false });
  }

  async publishPost(payload, { scheduleOnFailure = true } = {}) {
    try {
      const telegramMessageIds = payload.telegramMessageIds ?? [payload.telegramMessageId];
      const primaryTelegramMessageId = telegramMessageIds[0];
      const replyTarget = payload.replyToTelegramMessageId
        ? await findPostMapping(payload.telegramChatId, payload.replyToTelegramMessageId)
        : null;
      const attachments = await this.uploadPhotoAttachments(payload.photoFileIds ?? []);

      const response = replyTarget
        ? await this.openVkWall.repostPost({
          text: payload.text,
          attachments,
          originalOwnerId: replyTarget.openvk_owner_id,
          originalPostId: replyTarget.openvk_post_id,
        })
        : await this.openVkWall.publishPost({
          text: payload.text,
          attachments,
        });

      const openvkPostId = response?.post_id ?? response;

      await savePostMappings({
        telegramChatId: payload.telegramChatId,
        telegramMessageIds,
        openvkOwnerId: config.openvk.ownerId,
        openvkPostId,
        text: payload.text,
      });
      await cancelPendingRetriesForTelegramMessages('post_sync', payload.telegramChatId, telegramMessageIds);
      await cancelPendingRetriesForTelegramMessages('post_text_sync', payload.telegramChatId, telegramMessageIds);

      await this.telegramLogger.info(
        replyTarget
          ? `Telegram reply ${primaryTelegramMessageId} reposted OpenVK wall${replyTarget.openvk_owner_id}_${replyTarget.openvk_post_id} to wall${config.openvk.ownerId}_${openvkPostId}.`
          : `Telegram post ${primaryTelegramMessageId} published to OpenVK wall${config.openvk.ownerId}_${openvkPostId}.`,
      );
    } catch (error) {
      if (scheduleOnFailure) {
        await this.scheduleRetry(payload, error);
        return;
      }
      throw error;
    }
  }

  async scheduleRetry(payload, error) {
    const runAfter = new Date(Date.now() + config.retryDelayMs);
    await enqueueRetry('post_sync', payload, runAfter);
    await this.telegramLogger.error(
      `OpenVK post sync failed. Retry scheduled at ${runAfter.toISOString()}. ${errorToString(error)}`,
    );
  }

  collectMediaGroupMessage(message, extracted) {
    const key = `${message.chat.id}:${message.media_group_id}`;
    const group = this.mediaGroups.get(key) ?? {
      chatId: message.chat.id,
      mediaGroupId: message.media_group_id,
      messages: [],
      timer: null,
    };

    group.messages.push({
      telegramMessageId: message.message_id,
      replyToTelegramMessageId: message.reply_to_message?.message_id ?? null,
      text: extracted.text,
      photoFileId: extracted.photoFileId,
    });

    if (group.timer) clearTimeout(group.timer);
    group.timer = setTimeout(() => {
      this.flushMediaGroup(key).catch((error) => {
        this.telegramLogger.error(`Failed to flush Telegram media group ${key}. ${errorToString(error)}`);
      });
    }, config.mediaGroupSettleMs);

    this.mediaGroups.set(key, group);
  }

  async flushMediaGroup(key) {
    const group = this.mediaGroups.get(key);
    if (!group) return;
    this.mediaGroups.delete(key);

    const messages = group.messages.sort((a, b) => a.telegramMessageId - b.telegramMessageId);
    const telegramMessageIds = messages.map((message) => message.telegramMessageId);
    const existing = await findPostMapping(group.chatId, telegramMessageIds[0]);
    if (existing) return;

    const text = messages.map((message) => message.text).find(Boolean) ?? '';
    const replyToTelegramMessageId = messages.map((message) => message.replyToTelegramMessageId).find(Boolean) ?? null;
    const photoFileIds = messages.map((message) => message.photoFileId).filter(Boolean);

    await this.publishPost({
      telegramChatId: group.chatId,
      telegramMessageIds,
      replyToTelegramMessageId,
      text,
      photoFileIds,
      source: 'telegram_media_group',
    });
  }

  async uploadPhotoAttachments(photoFileIds) {
    const attachments = [];

    for (const photoFileId of photoFileIds) {
      const file = await downloadTelegramFile(this.bot, photoFileId);
      const attachment = await this.openVkPhotos.uploadWallPhotoFromBuffer(file.buffer, file.filePath);
      attachments.push(attachment);
    }

    return attachments;
  }

  extractText(message) {
    const text = message.text ?? message.caption ?? '';
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  extractLargestPhotoFileId(message) {
    if (!Array.isArray(message.photo) || message.photo.length === 0) return null;
    return message.photo[message.photo.length - 1].file_id;
  }

  isServiceMessage(message) {
    return Boolean(message.new_chat_photo);
  }
}
