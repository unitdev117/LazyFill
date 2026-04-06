/**
 * ============================================================
 *  SETTINGS MANAGER — Profile & Configuration Engine
 * ============================================================
 *  Manages user profiles (Education, Travel, etc.) with
 *  key-value pairs and handles API key lifecycle.
 * ============================================================
 */

import db from '../database/db_adapter.js';

const SettingsManager = {
  /* --------------------------------------------------
   *  API KEY MANAGEMENT
   * -------------------------------------------------- */

  /**
   * Save the Gemini API key securely via the DB layer.
   * @param {string} apiKey
   */
  async saveApiKey(apiKey) {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new Error('SETTINGS: API key appears invalid (too short).');
    }
    await db.saveApiKey(apiKey.trim());
    return { success: true };
  },

  /**
   * Retrieve the stored API key.
   * @returns {Promise<string|null>}
   */
  async getApiKey() {
    return db.getApiKey();
  },

  /**
   * Delete the stored API key.
   */
  async deleteApiKey() {
    await db.deleteApiKey();
    return { success: true };
  },

  /* --------------------------------------------------
   *  PROFILE CRUD
   * -------------------------------------------------- */

  /**
   * Create a new profile.
   * @param {string} name     — e.g. "Education"
   * @param {Object} fields   — e.g. { "First Name": "John", "University": "MIT" }
   * @returns {Promise<Profile>}
   */
  async createProfile(name, fields = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('SETTINGS: Profile name is required.');
    }

    const profile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      fields: { ...fields },
    };

    return db.saveProfile(profile);
  },

  /**
   * Update an existing profile's fields.
   * @param {string} profileId
   * @param {Object} updates   — partial update { name?, fields? }
   */
  async updateProfile(profileId, updates) {
    const existing = await db.getProfileById(profileId);
    if (!existing) throw new Error(`SETTINGS: Profile ${profileId} not found.`);

    if (updates.name) existing.name = updates.name.trim();
    if (updates.fields) existing.fields = { ...existing.fields, ...updates.fields };

    return db.saveProfile(existing);
  },

  /**
   * Delete a profile.
   * @param {string} profileId
   */
  async deleteProfile(profileId) {
    const deleted = await db.deleteProfile(profileId);
    if (!deleted) throw new Error(`SETTINGS: Profile ${profileId} not found.`);

    // If this was the active profile, clear the setting
    const settings = await db.getSettings();
    if (settings.activeProfileId === profileId) {
      await db.saveSettings({ activeProfileId: null });
    }
    return { success: true };
  },

  /**
   * Get all profiles.
   */
  async getAllProfiles() {
    return db.getAllProfiles();
  },

  /**
   * Get a specific profile by ID.
   */
  async getProfile(profileId) {
    return db.getProfileById(profileId);
  },

  /* --------------------------------------------------
   *  ACTIVE PROFILE
   * -------------------------------------------------- */

  /**
   * Set a profile as the "active" profile for autofill.
   */
  async setActiveProfile(profileId) {
    if (profileId) {
      const exists = await db.getProfileById(profileId);
      if (!exists) throw new Error(`SETTINGS: Profile ${profileId} does not exist.`);
    }
    await db.saveSettings({ activeProfileId: profileId || null });
    return { success: true };
  },

  /**
   * Get the currently active profile (full object).
   * @returns {Promise<Profile|null>}
   */
  async getActiveProfile() {
    const settings = await db.getSettings();
    if (!settings.activeProfileId) return null;
    return db.getProfileById(settings.activeProfileId);
  },

  /**
   * Get current settings.
   */
  async getSettings() {
    const settings = await db.getSettings();
    // Default to true if not set, typical for "always on" features that are core to UX
    if (typeof settings.ghostPreviewEnabled === 'undefined') {
      settings.ghostPreviewEnabled = true; 
    }
    return settings;
  },

  /**
   * Enable or disable passive Ghost Preview scanning
   * @param {boolean} enabled 
   */
  async setGhostPreview(enabled) {
    await db.saveSettings({ ghostPreviewEnabled: enabled });
    return { success: true };
  }
};

export default SettingsManager;
