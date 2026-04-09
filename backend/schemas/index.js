/**
 * User Schema Definition
 */

export const UserSchema = {
  type: 'object',
  required: ['email', 'password', 'fullName'],
  properties: {
    fullName: { type: 'string', minLength: 2 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 6 },
    tokenVersion: { type: 'integer', default: 0 },
    stats: {
      type: 'object',
      properties: {
        totalAutofills: { type: 'integer', default: 0 }
      }
    },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

export const ProfileSchema = {
  type: 'object',
  required: ['userId', 'name', 'fields'],
  properties: {
    userId: { type: 'string' },
    name: { type: 'string' },
    fields: { type: 'object' }, // Key-value pairs of field labels and values
    lastSyncedAt: { type: 'string', format: 'date-time' },
    deviceName: { type: 'string' }
  }
};
