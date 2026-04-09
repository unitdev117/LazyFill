export const DEFAULT_USER_SETTINGS = Object.freeze({
  activeProfileId: null,
  ghostPreviewEnabled: true,
});

export const UserDocumentSchema = {
  type: 'object',
  required: ['email', 'passwordHash', 'displayName', 'tokenVersion', 'settings', 'createdAt', 'updatedAt'],
  properties: {
    email: { type: 'string', format: 'email' },
    displayName: { type: 'string', minLength: 1, maxLength: 120 },
    passwordHash: { type: 'string', minLength: 20 },
    tokenVersion: { type: 'integer', minimum: 0 },
    apiKey: { type: 'string' },
    settings: {
      type: 'object',
      properties: {
        activeProfileId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        ghostPreviewEnabled: { type: 'boolean' },
      },
      additionalProperties: true,
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const SignUpBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 6, maxLength: 128 },
    profiles: { type: 'array', default: [] },
    apiKey: { type: 'string' },
    settings: {
      type: 'object',
      additionalProperties: true,
      properties: {
        activeProfileId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        ghostPreviewEnabled: { type: 'boolean' },
      },
    },
  },
};

export const LoginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 6, maxLength: 128 },
  },
};

export const ChangePasswordBodySchema = {
  type: 'object',
  required: ['oldPassword', 'newPassword'],
  additionalProperties: false,
  properties: {
    oldPassword: { type: 'string', minLength: 6, maxLength: 128 },
    newPassword: { type: 'string', minLength: 6, maxLength: 128 },
  },
};
