import { getDefaultSystemConfig, loadBranding, registerCloudBrandingWrites } from './branding.js';
import { registerCloudModuleRoutes } from './moduleRoutes.js';
import { registerCloudFreightRoutes } from './freightRoutes.js';
import express, { type RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreChatService } from './chat.js';
import { registerCloudChatRoutes } from './chatRoutes.js';
import type { Employee } from '../../types';
import { CloudAuthService, firebasePasswordVerifier } from './authService.js';
import { registerCloudAuthRoutes, cloudSessionId } from './authRoutes.js';
import { loadCloudIdentity } from './identity.js';

/** Separate migration surface. Does not replace or impersonate the local API. */
export function createCloudApi(runtime: { auth: Auth; db: Firestore }, options: { passwordVerifier?: (email: string, password: string) => Promise<string> } = {}) {
  const { auth, db } = runtime;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get(['/api/cloud/system-config', '/api/cloud/system-config/version'], async (req, res, next) => {
    try { const config = await loadBranding(db);
      res.json(req.path.endsWith('/version') ? { revision: config!.revision } : { systemConfig: config, defaults: getDefaultSystemConfig() });
    } catch (error) { next(error); }
  });
  const passwordVerifier = options.passwordVerifier || (process.env.FIREBASE_WEB_API_KEY ? firebasePasswordVerifier({
    projectId: 'rodovar-conecta-hml-60770', apiKey: process.env.FIREBASE_WEB_API_KEY,
  }) : undefined);
  const sessions = passwordVerifier ? new CloudAuthService(runtime, passwordVerifier) : undefined;
  if (sessions) registerCloudAuthRoutes(app, sessions);
  else app.use('/api/cloud/auth', (_req, res) => res.status(503).json({ error: 'Autenticação de homologação ainda não configurada.', code: 'AUTH_CONFIGURATION_REQUIRED' }));
  app.get('/api/cloud/health', async (_req, res, next) => {
    try {
      const checkpoint = await db.collection('system_settings').doc('homologation_check').get();
      if (!checkpoint.exists) { res.status(503).json({ error: 'Persistência de homologação não validada.' }); return; }
      // Firestore connectivity alone does not establish that portal login is ready.
      res.status(sessions ? 200 : 503).json({
        status: sessions ? 'ok' : 'configuration_required', environment: 'homologation',
        persistence: 'firestore', migration: 'partial',
        authentication: sessions ? 'configured' : 'not_configured',
        portalIntegration: 'auth_freights_chat_corporate',
      });
    } catch (error) { next(error); }
  });
  const guard: RequestHandler = async (req: any, res, next) => {
    if (sessions && cloudSessionId(req)) {
      try {
        const session = await sessions.session(cloudSessionId(req));
        if (session.user.mustChangePassword) { res.status(403).json({ error: 'Troque sua senha antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }); return; }
        if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrfToken) {
          res.status(403).json({ error: 'Atualize a sessão antes de continuar.', code: 'CSRF_INVALID' }); return;
        }
        req.sessionUser = session.user; next(); return;
      } catch (error) { next(error); return; }
    }
    const match = /^Bearer ([^ ]+)$/.exec(String(req.headers.authorization || ''));
    if (!match) { res.status(401).json({ error: 'Entre para acessar.', code: 'AUTH_REQUIRED' }); return; }
    try {
      const token = await auth.verifyIdToken(match[1], true);
      const identity = await loadCloudIdentity(runtime, token.uid);
      if (identity.accessRevokedAt && token.auth_time <= Math.floor(identity.accessRevokedAt / 1000)) {
        res.status(401).json({ error: 'Sessão revogada. Entre novamente.', code: 'SESSION_REVOKED' });
        return;
      }
      req.sessionUser = identity.user;
      if (req.sessionUser.mustChangePassword) { res.status(403).json({ error: 'Troque sua senha antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }); return; }
      next();
    } catch (error: any) {
      if (String(error?.code || '').startsWith('auth/')) {
        res.status(401).json({ error: 'Sessão inválida ou expirada.', code: 'INVALID_SESSION' });
      } else {
        next(error);
      }
    }
  };
  app.get('/api/cloud/session', guard, (req: any, res) => res.json({ authenticated: true, user: req.sessionUser }));
  registerCloudBrandingWrites(app, guard, db);
  registerCloudChatRoutes(app, guard, new FirestoreChatService(db));
  registerCloudFreightRoutes(app, guard, db);
  registerCloudModuleRoutes(app, guard, db);
  app.use('/api/cloud', guard, (req, res, next) => {
    if (/^\/(admin|pagamentos|drivers|rh-external|customer-covers|documents)(\/|$)/.test(req.path)) { res.status(503).json({ error: 'Este serviço ainda não foi migrado para a homologação remota. Nenhum dado foi alterado.', code: 'MODULE_NOT_MIGRATED' }); return; }
    next();
  });
  app.use((_req, res) => res.status(404).json({ error: 'Operação fora do adaptador de migração.', code: 'CLOUD_ROUTE_NOT_FOUND' }));
  app.use((error: any, _req: any, res: any, _next: any) => {
    const status = [400, 401, 403, 404, 409, 429].includes(error.status) ? error.status : 503;
    if (status === 503) console.error('cloud_api_failure', { code: String(error?.code || 'UNAVAILABLE').slice(0, 80) });
    res.status(status).json({ authenticated: false, error: status === 503 ? 'Serviço temporariamente indisponível. Tente novamente.' : error.message,
      ...(error.code && status !== 503 ? { code: error.code } : {}),
      ...(error.locked !== undefined ? { locked: error.locked, blockedUntil: error.blockedUntil, serverNow: Date.now(), remainingSeconds: error.remainingSeconds } : {}),
    });
  });
  return app;
}
