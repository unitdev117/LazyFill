import { CONFIG } from '../config.js';

export class CloudStorage {
  constructor(token) {
    this.token = token;
  }

  setToken(token) {
    this.token = token;
  }

  async request(endpoint, { method = 'GET', body = null, requireAuth = true } = {}) {
    if (requireAuth && !this.token) {
      throw new Error('Not authenticated');
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let lastError = null;

    for (const baseUrl of CONFIG.API_BASE_URLS) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : null,
        });

        if (response.status === 401) {
          throw new Error('AUTH_EXPIRED');
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || 'Cloud request failed');
        }

        return payload;
      } catch (error) {
        if (error.message === 'AUTH_EXPIRED') {
          throw error;
        }
        lastError = error;
      }
    }

    if (lastError instanceof TypeError && lastError.message?.includes('fetch')) {
      throw new Error('LazyFill backend is not reachable on port 9000. Start the backend server and reload the extension.');
    }

    throw lastError || new Error('Cloud request failed');
  }

  async signUp(payload) {
    return this.request('/auth/signup', {
      method: 'POST',
      body: payload,
      requireAuth: false,
    });
  }

  async login(payload) {
    return this.request('/auth/login', {
      method: 'POST',
      body: payload,
      requireAuth: false,
    });
  }

  async changePassword(payload) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: payload,
    });
  }

  async pushState(payload) {
    return this.request('/sync/state', {
      method: 'POST',
      body: payload,
    });
  }

  async pullState() {
    return this.request('/sync/state');
  }
}
