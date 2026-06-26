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
}
