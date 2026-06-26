import { config } from '../config.js';

export class OpenVkWall {
  constructor(client) {
    this.client = client;
  }

  async publishTextPost(text) {
    return this.client.method('wall.post', {
      owner_id: config.openvk.ownerId,
      message: text,
      from_group: 1,
    });
  }

  async repostTextPost({ text, originalOwnerId, originalPostId }) {
    return this.client.method('wall.repost', {
      object: `wall${originalOwnerId}_${originalPostId}`,
      message: text,
      group_id: Math.abs(config.openvk.ownerId),
      as_group: 1,
    });
  }
}
