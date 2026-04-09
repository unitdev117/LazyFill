import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { UserRepository, ProfileRepository } from './repository/index.js';
import { AuthController, SyncController } from './controllers/db_controller.js';
import {
  ChangePasswordBodySchema,
  LoginBodySchema,
  SignUpBodySchema,
  SyncStateBodySchema,
} from './schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath, quiet: true });

if (!process.env.MONGO_URI) {
  throw new Error(`Missing MONGO_URI. Expected it in ${envPath}`);
}

if (!process.env.JWT_SECRET) {
  throw new Error(`Missing JWT_SECRET. Expected it in ${envPath}`);
}

const fastify = Fastify({
  logger: true,
});

fastify.decorate('userRepo', null);
fastify.decorate('profileRepo', null);
fastify.decorate('mongoClient', null);
fastify.decorate('dbState', {
  ready: false,
  error: null,
});

fastify.register(cors, {
  origin: '*',
});

fastify.register(jwt, {
  secret: process.env.JWT_SECRET,
});

fastify.decorate('requireDatabase', async (_request, reply) => {
  if (fastify.dbState.ready && fastify.userRepo && fastify.profileRepo) {
    return;
  }

  return reply.code(503).send({
    success: false,
    error: fastify.dbState.error
      ? `Database unavailable: ${fastify.dbState.error}`
      : 'Database unavailable',
  });
});

fastify.decorate('authenticate', async (request, reply) => {
  try {
    if (!fastify.dbState.ready || !fastify.userRepo) {
      return reply.code(503).send({
        success: false,
        error: fastify.dbState.error
          ? `Database unavailable: ${fastify.dbState.error}`
          : 'Database unavailable',
      });
    }

    await request.jwtVerify();
    const user = await fastify.userRepo.findByEmail(request.user.email);
    if (!user || user.tokenVersion !== request.user.version) {
      throw new Error('Session expired');
    }
  } catch (err) {
    if (reply.sent) {
      return;
    }
    reply.code(401).send({ error: err.message || 'Unauthorized' });
  }
});

async function connectDatabase() {
  try {
    const client = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();

    const db = process.env.MONGO_DB_NAME
      ? client.db(process.env.MONGO_DB_NAME)
      : client.db();

    fastify.mongoClient = client;
    fastify.userRepo = new UserRepository(db);
    fastify.profileRepo = new ProfileRepository(db);
    await fastify.userRepo.ensureIndexes();
    await fastify.profileRepo.ensureIndexes();

    fastify.dbState.ready = true;
    fastify.dbState.error = null;
    fastify.log.info('Repositories initialized and ready.');
  } catch (error) {
    fastify.dbState.ready = false;
    fastify.dbState.error = error.message;
    fastify.log.error(error, 'MongoDB connection failed');
  }
}

fastify.post(
  '/api/auth/signup',
  { schema: { body: SignUpBodySchema }, preHandler: fastify.requireDatabase },
  AuthController.signup
);
fastify.post(
  '/api/auth/login',
  { schema: { body: LoginBodySchema }, preHandler: fastify.requireDatabase },
  AuthController.login
);
fastify.get('/api/health', async () => ({
  status: 'ok',
  database: fastify.dbState.ready ? 'ready' : 'unavailable',
  databaseError: fastify.dbState.error,
}));

fastify.register(async (instance) => {
  instance.addHook('preHandler', instance.requireDatabase);
  instance.addHook('preHandler', instance.authenticate);

  instance.post(
    '/api/auth/change-password',
    { schema: { body: ChangePasswordBodySchema } },
    AuthController.changePassword
  );
  instance.get('/api/sync/state', SyncController.pullState);
  instance.post('/api/sync/state', { schema: { body: SyncStateBodySchema } }, SyncController.pushState);
  instance.get('/api/sync/profiles', SyncController.pullProfiles);
  instance.post('/api/sync/profiles', { schema: { body: SyncStateBodySchema } }, SyncController.pushProfiles);
});

fastify.addHook('onClose', async () => {
  if (fastify.mongoClient) {
    await fastify.mongoClient.close();
  }
});

const start = async () => {
  try {
    const port = process.env.PORT || 9000;
    await fastify.listen({ port, host: '0.0.0.0' });
    await connectDatabase();
    console.log(`LazyFill Backend running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
