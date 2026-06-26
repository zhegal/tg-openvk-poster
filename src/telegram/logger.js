import { config } from '../config.js';
import { log } from '../utils/log.js';

export class TelegramLogger {
  constructor(bot) {
    this.bot = bot;
  }

  async info(message) {
    log.info(message);
    await this.send(`INFO: ${message}`);
  }

  async warn(message) {
    log.warn(message);
    await this.send(`WARN: ${message}`);
  }

  async error(message) {
    log.error(message);
    await this.send(`ERROR: ${message}`);
  }

  async send(message) {
    if (!config.telegram.logChatId) return;

    try {
      await this.bot.sendMessage(config.telegram.logChatId, message, {
        disable_web_page_preview: true,
      });
    } catch (error) {
      log.warn('Failed to send Telegram log message', { error: error.message });
    }
  }
}
