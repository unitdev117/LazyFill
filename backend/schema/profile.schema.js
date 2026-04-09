export const ProfileDocumentSchema = {
  type: 'object',
  required: ['id', 'userId', 'name', 'fields', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', minLength: 1 },
    userId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, maxLength: 160 },
    fields: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const SyncStateBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profiles: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        required: ['id', 'name', 'fields'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1, maxLength: 160 },
          fields: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          createdAt: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          updatedAt: { anyOf: [{ type: 'number' }, { type: 'string' }] },
        },
      },
    },
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
