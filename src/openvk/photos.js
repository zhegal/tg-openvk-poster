import FormData from 'form-data';
import axios from 'axios';
import { config } from '../config.js';

function fileNameFromTelegramPath(filePath) {
  const originalName = filePath?.split('/').pop();
  return originalName || `avatar-${Date.now()}.jpg`;
}

export class OpenVkPhotos {
  constructor(client) {
    this.client = client;
  }

  async setOwnerAvatarFromBuffer(buffer, telegramFilePath) {
    const uploadServer = await this.client.method(
      'photos.getOwnerPhotoUploadServer',
      { owner_id: config.openvk.ownerId },
      'get',
    );

    if (!uploadServer?.upload_url) {
      throw new Error('OpenVK did not return upload_url');
    }

    const uploadResult = await this.uploadPhoto(uploadServer.upload_url, buffer, telegramFilePath);

    if (!uploadResult.photo || !uploadResult.hash) {
      const error = new Error('OpenVK upload returned unexpected response');
      error.response = { data: uploadResult };
      throw error;
    }

    return this.client.method('photos.saveOwnerPhoto', {
      photo: uploadResult.photo,
      hash: uploadResult.hash,
    });
  }

  async uploadWallPhotoFromBuffer(buffer, telegramFilePath) {
    const groupId = Math.abs(config.openvk.ownerId);
    const uploadServer = await this.client.method(
      'photos.getWallUploadServer',
      { group_id: groupId },
      'get',
    );

    if (!uploadServer?.upload_url) {
      throw new Error('OpenVK did not return wall upload_url');
    }

    const uploadResult = await this.uploadPhoto(uploadServer.upload_url, buffer, telegramFilePath);

    if (!uploadResult.photo || !uploadResult.hash) {
      const error = new Error('OpenVK wall upload returned unexpected response');
      error.response = { data: uploadResult };
      throw error;
    }

    const savedPhotos = await this.client.method('photos.saveWallPhoto', {
      photo: uploadResult.photo,
      hash: uploadResult.hash,
      group_id: groupId,
    });

    const savedPhoto = Array.isArray(savedPhotos) ? savedPhotos[0] : savedPhotos;
    if (!savedPhoto?.owner_id || !savedPhoto?.id) {
      const error = new Error('OpenVK saveWallPhoto returned unexpected response');
      error.response = { data: savedPhotos };
      throw error;
    }

    return `photo${savedPhoto.owner_id}_${savedPhoto.id}`;
  }

  async uploadPhoto(uploadUrl, buffer, telegramFilePath) {
    const form = new FormData();
    form.append('photo', buffer, {
      filename: fileNameFromTelegramPath(telegramFilePath),
      contentType: 'image/jpeg',
    });

    const response = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      timeout: 120_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    return response.data;
  }
}
