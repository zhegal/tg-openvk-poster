import axios from 'axios';
import { config } from '../config.js';
import { errorToString } from '../utils/errors.js';
import { log } from '../utils/log.js';

export class TelegramClient {
  constructor() {
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${config.telegram.botToken}`,
      timeout: 45_000,
    });
    this.running = false;
    this.offset = 0;
  }

  async startPolling(onUpdate) {
    this.running = true;

    while (this.running) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await onUpdate(update);
        }
      } catch (error) {
        log.error('Telegram polling request failed', { error: errorToString(error) });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  stopPolling() {
    this.running = false;
  }

  async getUpdates() {
    const response = await this.http.post('/getUpdates', {
      offset: this.offset,
      timeout: 30,
      allowed_updates: ['channel_post'],
    });

    if (!response.data?.ok) {
      throw new Error(`Telegram getUpdates failed: ${JSON.stringify(response.data)}`);
    }

    return response.data.result ?? [];
  }

  async getFile(fileId) {
    const response = await this.http.post('/getFile', { file_id: fileId });
    if (!response.data?.ok) {
      throw new Error(`Telegram getFile failed: ${JSON.stringify(response.data)}`);
    }
    return response.data.result;
  }

  async sendMessage(chatId, text, options = {}) {
    const response = await this.http.post('/sendMessage', {
      chat_id: chatId,
      text,
      ...options,
    });

    if (!response.data?.ok) {
      throw new Error(`Telegram sendMessage failed: ${JSON.stringify(response.data)}`);
    }

    return response.data.result;
  }
}
