import axios from 'axios';
import { config } from '../config.js';

export async function downloadTelegramFile(bot, fileId) {
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

  return {
    buffer: Buffer.from(response.data),
    filePath: file.file_path,
    uniqueId: file.file_unique_id,
  };
}
