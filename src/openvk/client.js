import axios from 'axios';
import { config } from '../config.js';

export class OpenVkClient {
  constructor() {
    this.http = axios.create({
      baseURL: config.openvk.baseUrl,
      timeout: 60_000,
    });
  }

  async method(name, params = {}, httpMethod = 'post') {
    const body = new URLSearchParams();
    body.set('access_token', config.openvk.accessToken);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        body.set(key, String(value));
      }
    }

    const url = `/method/${name}`;
    const response = httpMethod === 'get'
      ? await this.http.get(url, { params: Object.fromEntries(body.entries()) })
      : await this.http.post(url, body);

    if (response.data?.error) {
      const error = new Error(response.data.error.error_msg || 'OpenVK API error');
      error.response = { data: response.data };
      throw error;
    }

    if (!Object.prototype.hasOwnProperty.call(response.data ?? {}, 'response')) {
      const error = new Error('OpenVK API returned unexpected response');
      error.response = { data: response.data };
      throw error;
    }

    return response.data.response;
  }
}
