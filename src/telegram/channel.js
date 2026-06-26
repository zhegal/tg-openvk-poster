import { config } from '../config.js';

export function isConfiguredChannel(chat) {
  const configured = config.telegram.channelId;
  const chatId = chat?.id;
  const username = chat?.username ? `@${chat.username}` : null;
  return String(chatId) === configured || Number(configured) === chatId || username === configured;
}
