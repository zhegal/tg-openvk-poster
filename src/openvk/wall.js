import { config } from '../config.js';

export class OpenVkWall {
  constructor(client) {
    this.client = client;
  }

  async publishPost({ text = '', attachments = [] }) {
    return this.client.method('wall.post', {
      owner_id: config.openvk.ownerId,
      message: text,
      attachments: attachments.join(','),
      from_group: 1,
    });
  }

  async repostPost({ text = '', attachments = [], originalOwnerId, originalPostId }) {
    return this.client.method('wall.repost', {
      object: `wall${originalOwnerId}_${originalPostId}`,
      message: text,
      attachments: attachments.join(','),
      group_id: Math.abs(config.openvk.ownerId),
      as_group: 1,
    });
  }
}
