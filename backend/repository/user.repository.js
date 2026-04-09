import { DEFAULT_USER_SETTINGS } from '../schema/index.js';

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(settings || {}),
  };
}

export class UserRepository {
  constructor(db) {
    this.collection = db.collection('users');
  }

  async ensureIndexes() {
    await this.collection.createIndex({ email: 1 }, { unique: true, name: 'users_email_unique' });
  }

  async findByEmail(email) {
    return this.collection.findOne({ email });
  }

  async create({ email, displayName, passwordHash, apiKey = '', settings = DEFAULT_USER_SETTINGS }) {
    const now = new Date().toISOString();
    const document = {
      email,
      displayName,
      passwordHash,
      apiKey: apiKey || '',
      settings: normalizeSettings(settings),
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.insertOne(document);
    return document;
  }

  async updatePassword(email, passwordHash, nextTokenVersion) {
    const updatedAt = new Date().toISOString();
    await this.collection.updateOne(
      { email },
      {
        $set: {
          passwordHash,
          tokenVersion: nextTokenVersion,
          updatedAt,
        },
      }
    );
  }

  async updateSyncState(email, { apiKey = '', settings = DEFAULT_USER_SETTINGS }) {
    const updatedAt = new Date().toISOString();
    await this.collection.updateOne(
      { email },
      {
        $set: {
          apiKey: apiKey || '',
          settings: normalizeSettings(settings),
          updatedAt,
        },
      }
    );
  }
}
