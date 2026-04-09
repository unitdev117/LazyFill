function normalizeTimestamp(value, fallback) {
  if (!value) return fallback;

  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function normalizeFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields || {})
      .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value)])
      .filter(([key]) => key)
  );
}

function normalizeProfile(userId, profile = {}) {
  const now = new Date().toISOString();

  return {
    id: String(profile.id || '').trim(),
    userId,
    name: String(profile.name || '').trim(),
    fields: normalizeFields(profile.fields),
    createdAt: normalizeTimestamp(profile.createdAt, now),
    updatedAt: normalizeTimestamp(profile.updatedAt, now),
  };
}

export class ProfileRepository {
  constructor(db) {
    this.collection = db.collection('profiles');
  }

  async ensureIndexes() {
    await this.collection.createIndex(
      { userId: 1, id: 1 },
      { unique: true, name: 'profiles_user_id_unique' }
    );
    await this.collection.createIndex({ userId: 1, updatedAt: -1 }, { name: 'profiles_user_updated_at' });
  }

  async getAllByUserId(userId) {
    const profiles = await this.collection.find({ userId }).sort({ updatedAt: -1, createdAt: 1 }).toArray();
    return profiles.map(({ _id, ...profile }) => profile);
  }

  async replaceAllForUser(userId, profiles = []) {
    const normalizedProfiles = profiles
      .map((profile) => normalizeProfile(userId, profile))
      .filter((profile) => profile.id && profile.name);

    if (normalizedProfiles.length === 0) {
      await this.collection.deleteMany({ userId });
      return [];
    }

    const incomingIds = normalizedProfiles.map((profile) => profile.id);
    const operations = normalizedProfiles.map((profile) => ({
      updateOne: {
        filter: { userId, id: profile.id },
        update: {
          $set: {
            name: profile.name,
            fields: profile.fields,
            updatedAt: profile.updatedAt,
          },
          $setOnInsert: {
            userId,
            id: profile.id,
            createdAt: profile.createdAt,
          },
        },
        upsert: true,
      },
    }));

    await this.collection.bulkWrite(operations, { ordered: false });
    await this.collection.deleteMany({ userId, id: { $nin: incomingIds } });

    return this.getAllByUserId(userId);
  }
}
