import { config } from '../config.js';
import { enqueueRetry } from '../db/retryRepository.js';
import { findPostMapping, savePostMapping } from '../db/postRepository.js';
import { isConfiguredChannel } from '../telegram/channel.js';
import { errorToString } from '../utils/errors.js';

export class PostSync {
  constructor({ openVkWall, telegramLogger }) {
    this.openVkWall = openVkWall;
    this.telegramLogger = telegramLogger;
  }

  async handleChannelPost(message) {
    if (!isConfiguredChannel(message.chat)) return false;
    if (this.isServiceMessage(message)) return false;

    const text = this.extractText(message);
    if (!text) return false;

    const existing = await findPostMapping(message.chat.id, message.message_id);
    if (existing) {
      return true;
    }

    await this.publishTextPost({
      telegramChatId: message.chat.id,
      telegramMessageId: message.message_id,
      replyToTelegramMessageId: message.reply_to_message?.message_id ?? null,
      text,
      source: 'telegram_event',
    });

    return true;
  }

  async retry(payload) {
    await this.publishTextPost(payload, { scheduleOnFailure: false });
  }

  async publishTextPost(payload, { scheduleOnFailure = true } = {}) {
    try {
      const replyTarget = payload.replyToTelegramMessageId
        ? await findPostMapping(payload.telegramChatId, payload.replyToTelegramMessageId)
        : null;

      const response = replyTarget
        ? await this.openVkWall.repostTextPost({
          text: payload.text,
          originalOwnerId: replyTarget.openvk_owner_id,
          originalPostId: replyTarget.openvk_post_id,
        })
        : await this.openVkWall.publishTextPost(payload.text);

      const openvkPostId = response?.post_id ?? response;

      await savePostMapping({
        telegramChatId: payload.telegramChatId,
        telegramMessageId: payload.telegramMessageId,
        openvkOwnerId: config.openvk.ownerId,
        openvkPostId,
        text: payload.text,
      });

      await this.telegramLogger.info(
        replyTarget
          ? `Telegram reply ${payload.telegramMessageId} reposted OpenVK wall${replyTarget.openvk_owner_id}_${replyTarget.openvk_post_id} to wall${config.openvk.ownerId}_${openvkPostId}.`
          : `Telegram post ${payload.telegramMessageId} published to OpenVK wall${config.openvk.ownerId}_${openvkPostId}.`,
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
    await enqueueRetry('post_text_sync', payload, runAfter);
    await this.telegramLogger.error(
      `OpenVK text post sync failed. Retry scheduled at ${runAfter.toISOString()}. ${errorToString(error)}`,
    );
  }

  extractText(message) {
    const text = message.text ?? message.caption ?? '';
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  isServiceMessage(message) {
    return Boolean(message.new_chat_photo);
  }
}
