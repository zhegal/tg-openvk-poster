import { config } from '../config.js';

const levels = ['debug', 'info', 'warn', 'error'];
const currentLevel = levels.includes(config.logLevel) ? config.logLevel : 'info';

function shouldLog(level) {
  return levels.indexOf(level) >= levels.indexOf(currentLevel);
}

export const log = {
  debug(message, meta) {
    if (shouldLog('debug')) console.log(format('debug', message, meta));
  },
  info(message, meta) {
    if (shouldLog('info')) console.log(format('info', message, meta));
  },
  warn(message, meta) {
    if (shouldLog('warn')) console.warn(format('warn', message, meta));
  },
  error(message, meta) {
    if (shouldLog('error')) console.error(format('error', message, meta));
  },
};

function format(level, message, meta) {
  const base = {
    ts: new Date().toISOString(),
    level,
    message,
  };
  return JSON.stringify(meta ? { ...base, ...meta } : base);
}
