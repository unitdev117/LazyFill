/**
 * User Repository - Handles all User-related DB operations
 */

export class UserRepository {
  constructor(db) {
    this.collection = db.collection('users');
  }

  async findByEmail(email) {
    return await this.collection.findOne({ email });
  }

  async create(userData) {
    const result = await this.collection.insertOne({
      ...userData,
      tokenVersion: 0,
      stats: { totalAutofills: 0 },
      createdAt: new Date().toISOString()
    });
    return result;
  }

  async updatePassword(email, newPasswordHash, newTokenVersion) {
    return await this.collection.updateOne(
      { email },
      { 
        $set: { 
          password: newPasswordHash,
          tokenVersion: newTokenVersion 
        } 
      }
    );
  }

  async incrementAutofillStats(email) {
    return await this.collection.updateOne(
      { email },
      { $inc: { 'stats.totalAutofills': 1 } }
    );
  }
}

/**
 * Profile Repository - Handles all Profile-related DB operations
 */

export class ProfileRepository {
  constructor(db) {
    this.collection = db.collection('profiles');
  }

  async getAllByUserId(userId) {
    return await this.collection.find({ userId }).toArray();
  }

  async upsertMany(userId, profiles, deviceName) {
    const operations = profiles.map(profile => ({
      updateOne: {
        filter: { userId, id: profile.id }, // Assuming profile has a unique 'id' from frontend
        update: { 
          $set: { 
            ...profile, 
            userId, 
            deviceName,
            lastSyncedAt: new Date().toISOString() 
          } 
        },
        upsert: true
      }
    }));

    if (operations.length === 0) return null;
    return await this.collection.bulkWrite(operations);
  }

  async deleteOne(userId, profileId) {
    return await this.collection.deleteOne({ userId, id: profileId });
  }
}
