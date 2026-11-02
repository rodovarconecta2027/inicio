import express, { type RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreChatService } from './chat';
import { registerCloudChatRoutes } from './chatRoutes';
import type { Employee } from '../../types';

/** Separate migration surface. Does not replace or impersonate the local API. */
export function createCloudApi(runtime: { auth: Auth; db: Firestore }) {
  const { auth, db } = runtime;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/cloud/health', async (_req, res, next) => {
    try {
      const checkpoint = await db.collection('system_settings').doc('homologation_check').get();
      if (!checkpoint.exists) { res.status(503).json({ error: 'Persistência de homologação não validada.' }); return; }
      res.json({ status: 'ok', environment: 'homologation', persistence: 'firestore', migration: 'partial' });
    } catch (error) { next(error); }
  });
  const guard: RequestHandler = async (req: any, res, next) => {
    const match = /^Bearer ([^ ]+)$/.exec(String(req.headers.authorization || ''));
    if (!match) { res.status(401).json({ error: 'Entre para acessar.', code: 'AUTH_REQUIRED' }); return; }
    try {
      const token = await auth.verifyIdToken(match[1], true);
      const snapshot = await db.collection('users').doc(token.uid).get();
      const user = snapshot.data();
      if (!user?.active || user.approvalStatus !== 'APROVADO') {
        res.status(403).json({ error: 'Conta sem liberação para o portal.', code: 'ACCOUNT_NOT_APPROVED' }); return;
      }
      const profile = (await db.collection('employee_profiles').doc(token.uid).get()).data();
      if (!profile) { res.status(403).json({ error: 'Perfil corporativo não provisionado.' }); return; }
      // Explicit fields: credentials, internal authentication metadata and private
      // records are never copied to a response. No administrator is inferred by e-mail.
      req.sessionUser = { id: token.uid, name: profile.name, department: profile.department,
        roleTitle: profile.roleTitle, avatar: profile.avatar || '/assets/default-avatar.png',
        accessProfile: user.accessProfile, accessLevel: user.accessLevel,
        permissoesPaginas: user.permissoesPaginas, active: true, approvalStatus: 'APROVADO' } as Employee;
      if (req.sessionUser.accessLevel === 'ADMINISTRADOR') {
        const policy = (await db.collection('system_settings').doc('security').get()).data();
        if (policy?.protectedAdminUid !== token.uid) { res.status(403).json({ error: 'Administrador não autorizado.' }); return; }
      }
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
  registerCloudChatRoutes(app, guard, new FirestoreChatService(db));
  app.use((_req, res) => res.status(404).json({ error: 'Operação fora do adaptador de migração.', code: 'CLOUD_ROUTE_NOT_FOUND' }));
  app.use((error: any, _req: any, res: any, _next: any) => {
    const status = [400, 403, 404, 409].includes(error.status) ? error.status : 503;
    if (status === 503) console.error('cloud_api_failure', { code: String(error?.code || 'UNAVAILABLE').slice(0, 80) });
    res.status(status).json({ error: status === 503 ? 'Serviço temporariamente indisponível. Tente novamente.' : error.message });
  });
  return app;
}
