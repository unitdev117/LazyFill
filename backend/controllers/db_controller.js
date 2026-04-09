import { AuthService, SyncService } from '../services/db_service.js';

export const AuthController = {
  async signup(request, reply) {
    try {
      const { email, password, profiles, apiKey, settings } = request.body;
      const authResult = await AuthService.register(
        {
          userRepo: request.server.userRepo,
          profileRepo: request.server.profileRepo,
        },
        {
          email,
          password,
          profiles,
          apiKey,
          settings,
        }
      );

      const token = request.server.jwt.sign({
        email: authResult.user.email,
        version: authResult.tokenVersion,
      });

      return reply.code(201).send({
        success: true,
        token,
        user: authResult.user,
        profiles: authResult.state.profiles,
        apiKey: authResult.state.apiKey,
        settings: authResult.state.settings,
      });
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  },

  async login(request, reply) {
    try {
      const { email, password } = request.body;
      const authResult = await AuthService.login(
        {
          userRepo: request.server.userRepo,
          profileRepo: request.server.profileRepo,
        },
        { email, password }
      );

      const token = request.server.jwt.sign({
        email: authResult.user.email,
        version: authResult.tokenVersion,
      });

      return reply.send({
        success: true,
        token,
        user: authResult.user,
        profiles: authResult.state.profiles,
        apiKey: authResult.state.apiKey,
        settings: authResult.state.settings,
      });
    } catch (err) {
      return reply.code(401).send({ success: false, error: err.message });
    }
  },

  async changePassword(request, reply) {
    try {
      const { email } = request.user;
      const { oldPassword, newPassword } = request.body;

      const result = await AuthService.changePassword(request.server.userRepo, {
        email,
        oldPassword,
        newPassword,
      });

      return reply.send(result);
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  }
};

export const SyncController = {
  async pushState(request, reply) {
    try {
      const { email } = request.user;
      const state = await SyncService.pushState(
        {
          userRepo: request.server.userRepo,
          profileRepo: request.server.profileRepo,
        },
        email,
        request.body || {}
      );
      return reply.send({ success: true, ...state });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  },

  async pullState(request, reply) {
    try {
      const { email } = request.user;
      const state = await SyncService.pullState(
        {
          userRepo: request.server.userRepo,
          profileRepo: request.server.profileRepo,
        },
        email
      );
      return reply.send({ success: true, ...state });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  },

  async pushProfiles(request, reply) {
    try {
      const { email } = request.user;
      const state = await SyncService.pushState(
        {
          userRepo: request.server.userRepo,
          profileRepo: request.server.profileRepo,
        },
        email,
        { profiles: request.body?.profiles || [] }
      );
      return reply.send({ success: true, profiles: state.profiles });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  },

  async pullProfiles(request, reply) {
    try {
      const { email } = request.user;
      const state = await SyncService.pullState(
        {
          userRepo: request.server.userRepo,
          profileRepo: request.server.profileRepo,
        },
        email
      );
      return reply.send({ success: true, profiles: state.profiles });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  }
};
