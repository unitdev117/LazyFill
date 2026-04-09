import { LocalStorage } from './adapters/local_storage.js';
import { CloudStorage } from './adapters/cloud_storage.js';
import { CONFIG } from './config.js';

class DBAdapter {
  constructor() {
    this.cloud = new CloudStorage(null);
    this.syncTimer = null;
    this.isApplyingRemoteState = false;
    this.ready = this._init();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        this.handleStorageChange(changes, areaName);
      });
    }
  }

  async _init() {
    const data = await LocalStorage.get([
      CONFIG.STORAGE_KEYS.AUTH_TOKEN,
    ]);
    const token = data[CONFIG.STORAGE_KEYS.AUTH_TOKEN];
    if (token) {
      this.cloud.setToken(token);
    }
  }

  get isAuthenticated() {
    return !!this.cloud.token;
  }

  async ensureReady() {
    await this.ready;
  }

  async getAuthState() {
    await this.ensureReady();
    const data = await LocalStorage.get([
      CONFIG.STORAGE_KEYS.AUTH_TOKEN,
      CONFIG.STORAGE_KEYS.USER_DATA,
    ]);

    return {
      isAuthenticated: !!data[CONFIG.STORAGE_KEYS.AUTH_TOKEN],
      user: data[CONFIG.STORAGE_KEYS.USER_DATA] || null,
    };
  }

  async setAuth(token, userData) {
    await this.ensureReady();
    this.cloud.setToken(token);
    await LocalStorage.set({
      [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: token,
      [CONFIG.STORAGE_KEYS.USER_DATA]: userData,
      [CONFIG.STORAGE_KEYS.ONBOARDING_DONE]: true,
    });
  }

  async clearAuth() {
    await this.ensureReady();
    this.cloud.setToken(null);
    await LocalStorage.remove([CONFIG.STORAGE_KEYS.AUTH_TOKEN, CONFIG.STORAGE_KEYS.USER_DATA]);
  }

  async applyRemoteState({ token, user, profiles = [], apiKey = '', settings = CONFIG.DEFAULT_SETTINGS }) {
    await this.ensureReady();
    this.isApplyingRemoteState = true;
    try {
      if (token) {
        this.cloud.setToken(token);
      }
      await LocalStorage.set({
        ...(token ? { [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: token } : {}),
        ...(user ? { [CONFIG.STORAGE_KEYS.USER_DATA]: user } : {}),
        [CONFIG.STORAGE_KEYS.PROFILES]: profiles,
        [CONFIG.STORAGE_KEYS.API_KEY]: apiKey || '',
        [CONFIG.STORAGE_KEYS.SETTINGS]: {
          ...CONFIG.DEFAULT_SETTINGS,
          ...(settings || {}),
        },
        [CONFIG.STORAGE_KEYS.ONBOARDING_DONE]: true,
      });
    } finally {
      this.isApplyingRemoteState = false;
    }
  }

  async getLocalState() {
    await this.ensureReady();
    const data = await LocalStorage.get([
      CONFIG.STORAGE_KEYS.PROFILES,
      CONFIG.STORAGE_KEYS.API_KEY,
      CONFIG.STORAGE_KEYS.SETTINGS,
    ]);

    return {
      profiles: data[CONFIG.STORAGE_KEYS.PROFILES] || [],
      apiKey: data[CONFIG.STORAGE_KEYS.API_KEY] || '',
      settings: {
        ...CONFIG.DEFAULT_SETTINGS,
        ...(data[CONFIG.STORAGE_KEYS.SETTINGS] || {}),
      },
    };
  }

  async signUp({ email, password }) {
    const state = await this.getLocalState();
    const result = await this.cloud.signUp({
      email,
      password,
      ...state,
    });
    await this.applyRemoteState(result);
    return result;
  }

  async login({ email, password }) {
    const result = await this.cloud.login({ email, password });
    await this.applyRemoteState(result);
    return result;
  }

  async logout() {
    await this.clearAuth();
    await LocalStorage.set({
      [CONFIG.STORAGE_KEYS.ONBOARDING_DONE]: true,
    });
  }

  async refreshRemoteState() {
    await this.ensureReady();
    if (!this.isAuthenticated) {
      return this.getLocalState();
    }

    try {
      const result = await this.cloud.pullState();
      await this.applyRemoteState(result);
      return result;
    } catch (error) {
      if (error.message === 'AUTH_EXPIRED') {
        await this.clearAuth();
      }
      throw error;
    }
  }

  async changePassword({ oldPassword, newPassword }) {
    await this.ensureReady();
    const result = await this.cloud.changePassword({ oldPassword, newPassword });
    await this.clearAuth();
    return result;
  }

  scheduleSync() {
    if (!this.isAuthenticated) {
      return;
    }

    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncState().catch((error) => {
        console.warn('[LazyFill] Cloud sync failed:', error.message);
      });
    }, CONFIG.SYNC_DEBOUNCE_MS);
  }

  async syncState() {
    await this.ensureReady();
    if (!this.isAuthenticated) {
      return null;
    }

    const state = await this.getLocalState();
    try {
      return await this.cloud.pushState(state);
    } catch (error) {
      if (error.message === 'AUTH_EXPIRED') {
        await this.clearAuth();
      }
      throw error;
    }
  }

  handleStorageChange(changes, areaName) {
    if (areaName !== 'local' || this.isApplyingRemoteState) {
      return;
    }

    if (changes[CONFIG.STORAGE_KEYS.AUTH_TOKEN]) {
      const token = changes[CONFIG.STORAGE_KEYS.AUTH_TOKEN].newValue || null;
      this.cloud.setToken(token);
    }

    if (
      changes[CONFIG.STORAGE_KEYS.PROFILES] ||
      changes[CONFIG.STORAGE_KEYS.API_KEY] ||
      changes[CONFIG.STORAGE_KEYS.SETTINGS]
    ) {
      this.scheduleSync();
    }
  }

  async getAllProfiles() {
    const data = await LocalStorage.get(CONFIG.STORAGE_KEYS.PROFILES);
    return data[CONFIG.STORAGE_KEYS.PROFILES] || [];
  }

  async getProfileById(profileId) {
    const profiles = await this.getAllProfiles();
    return profiles.find((profile) => profile.id === profileId) || null;
  }

  async saveProfiles(profiles) {
    await LocalStorage.set({ [CONFIG.STORAGE_KEYS.PROFILES]: profiles });
    return profiles;
  }

  async saveProfile(profile) {
    const profiles = await this.getAllProfiles();
    const now = Date.now();
    const idx = profiles.findIndex((p) => p.id === profile.id);
    let nextProfile;

    if (idx >= 0) {
      nextProfile = { ...profiles[idx], ...profile, updatedAt: now };
      profiles[idx] = nextProfile;
    } else {
      nextProfile = {
        ...profile,
        id: profile.id || crypto.randomUUID(),
        createdAt: profile.createdAt || now,
        updatedAt: now,
      };
      profiles.push(nextProfile);
    }
    await this.saveProfiles(profiles);
    return nextProfile;
  }

  async deleteProfile(profileId) {
    const profiles = await this.getAllProfiles();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      return false;
    }
    await this.saveProfiles(nextProfiles);
    return true;
  }

  async getApiKey() {
    const data = await LocalStorage.get(CONFIG.STORAGE_KEYS.API_KEY);
    return data[CONFIG.STORAGE_KEYS.API_KEY] || null;
  }

  async saveApiKey(key) {
    await LocalStorage.set({ [CONFIG.STORAGE_KEYS.API_KEY]: key.trim() });
  }

  async deleteApiKey() {
    await LocalStorage.set({ [CONFIG.STORAGE_KEYS.API_KEY]: '' });
  }

  async getSettings() {
    const data = await LocalStorage.get(CONFIG.STORAGE_KEYS.SETTINGS);
    return {
      ...CONFIG.DEFAULT_SETTINGS,
      ...(data[CONFIG.STORAGE_KEYS.SETTINGS] || {}),
    };
  }

  async saveSettings(settings) {
    const current = await this.getSettings();
    await LocalStorage.set({ [CONFIG.STORAGE_KEYS.SETTINGS]: { ...current, ...settings } });
  }

  async appendLog(entry) {
    const logs = await this.getLogs();
    const nextLogs = [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...entry,
      },
      ...logs,
    ].slice(0, CONFIG.MAX_LOG_ENTRIES);

    await LocalStorage.set({ [CONFIG.STORAGE_KEYS.LOGS]: nextLogs });
  }

  async getLogs() {
    const data = await LocalStorage.get(CONFIG.STORAGE_KEYS.LOGS);
    return data[CONFIG.STORAGE_KEYS.LOGS] || [];
  }

  async clearLogs() {
    await LocalStorage.set({ [CONFIG.STORAGE_KEYS.LOGS]: [] });
  }
}

const db = new DBAdapter();
export default db;
export { CONFIG as DB_CONFIG };
