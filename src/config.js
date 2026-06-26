import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value == null ? fallback : value.trim();
}

function numberVar(name, fallback) {
  const raw = optional(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    channelId: required('TELEGRAM_CHANNEL_ID'),
    logChatId: optional('TELEGRAM_LOG_CHAT_ID') || null,
  },
  openvk: {
    baseUrl: optional('OPENVK_BASE_URL', 'https://api.openvk.org').replace(/\/+$/, ''),
    accessToken: required('OPENVK_ACCESS_TOKEN'),
    ownerId: numberVar('OPENVK_OWNER_ID', -3084),
  },
  databaseUrl: required('DATABASE_URL'),
  retryDelayMs: numberVar('RETRY_DELAY_MS', 60 * 60 * 1000),
  logLevel: optional('LOG_LEVEL', 'info'),
};
