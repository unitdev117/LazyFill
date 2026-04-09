import bcrypt from 'bcryptjs';
import { DEFAULT_USER_SETTINGS } from '../schema/index.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(settings || {}),
  };
}

function buildDisplayName(email) {
  const localPart = normalizeEmail(email).split('@')[0] || 'User';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ') || 'User';
}

function buildAuthPayload(user, profiles = []) {
  return {
    user: {
      email: user.email,
      displayName: user.displayName,
    },
    tokenVersion: user.tokenVersion,
    state: {
      profiles,
      apiKey: user.apiKey || '',
      settings: normalizeSettings(user.settings),
    },
  };
}

export const AuthService = {
  async register({ userRepo, profileRepo }, { email, password, profiles = [], apiKey = '', settings = {} }) {
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await userRepo.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepo.create({
      email: normalizedEmail,
      displayName: buildDisplayName(normalizedEmail),
      passwordHash,
      apiKey,
      settings,
    });
    const savedProfiles = await profileRepo.replaceAllForUser(normalizedEmail, profiles);

    return buildAuthPayload(user, savedProfiles);
  },

  async login({ userRepo, profileRepo }, { email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const profiles = await profileRepo.getAllByUserId(normalizedEmail);
    return buildAuthPayload(user, profiles);
  },

  async changePassword(userRepo, { email, oldPassword, newPassword }) {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Incorrect current password');
    }

    if (oldPassword === newPassword) {
      throw new Error('New password must be different from the current password');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const nextTokenVersion = (user.tokenVersion || 0) + 1;

    await userRepo.updatePassword(normalizedEmail, newPasswordHash, nextTokenVersion);
    return {
      success: true,
      message: 'Password updated. Please sign in again on all devices.',
    };
  },
};

export const SyncService = {
  async pushState({ userRepo, profileRepo }, email, { profiles = [], apiKey = '', settings = {} }) {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const nextProfiles = Array.isArray(profiles)
      ? await profileRepo.replaceAllForUser(normalizedEmail, profiles)
      : await profileRepo.getAllByUserId(normalizedEmail);

    const nextApiKey = typeof apiKey === 'string' ? apiKey : user.apiKey || '';
    const nextSettings = settings && typeof settings === 'object'
      ? { ...(user.settings || {}), ...settings }
      : (user.settings || {});

    await userRepo.updateSyncState(normalizedEmail, {
      apiKey: nextApiKey,
      settings: nextSettings,
    });

    const updatedUser = await userRepo.findByEmail(normalizedEmail);
    return {
      profiles: nextProfiles,
      apiKey: updatedUser.apiKey || '',
      settings: normalizeSettings(updatedUser.settings),
    };
  },

  async pullState({ userRepo, profileRepo }, email) {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const profiles = await profileRepo.getAllByUserId(normalizedEmail);
    return {
      profiles,
      apiKey: user.apiKey || '',
      settings: normalizeSettings(user.settings),
    };
  },
};
