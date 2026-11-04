import type { Express, Request } from 'express';
import { CloudAuthService } from './authService.js';

export function cloudSessionId(req: Request): string {
  const header = req.headers['x-rodovar-session'];
  if (typeof header === 'string') return header;
  return /(?:^|;\s*)rodovar_cloud_sid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
}

export function registerCloudAuthRoutes(app: Express, service: CloudAuthService) {
  app.put('/api/cloud/profile', async (req, res, next) => {
    try {
      const keys = Object.keys(req.body || {});
      if (keys.length && keys.every(key => ['name', 'phoneExt'].includes(key))) {
        res.json(await service.updateProfile(cloudSessionId(req), String(req.headers['x-csrf-token'] || ''), req.body));
        return;
      }
      if (!keys.includes('password') || keys.some(key => key !== 'password' && key !== 'currentPassword')) {
        res.status(400).json({ error: 'Campos de perfil não autorizados.' }); return;
      }
      const result = await service.changePassword(cloudSessionId(req), String(req.headers['x-csrf-token'] || ''), req.body.password, req.body.currentPassword);
      res.cookie('rodovar_cloud_sid', result.sessionId, { httpOnly: true, secure: Boolean(process.env.VERCEL) || req.secure,
        sameSite: 'lax', path: '/api/cloud', maxAge: result.expiresAt - Date.now() });
      res.json(result);
    } catch (error) { next(error); }
  });
  app.all(['/api/cloud/auth/register', '/api/cloud/auth/signup', '/api/cloud/auth/request-access'], (_req, res) => {
    res.status(403).json({ error: 'Cadastro público desabilitado. Procure o administrador.', code: 'PUBLIC_REGISTRATION_DISABLED' });
  });
  app.get('/api/cloud/auth/lock-status', async (req, res, next) => {
    try {
      const identifier = String(req.query.identifier || '');
      if (identifier.length > 254) { res.status(400).json({ error: 'Identificador inválido.' }); return; }
      res.json(await service.lockStatus(identifier));
    } catch (error) { next(error); }
  });
  app.post('/api/cloud/auth/login', async (req, res, next) => {
    try {
      const result = await service.login(req.body);
      res.cookie('rodovar_cloud_sid', result.sessionId, { httpOnly: true, secure: Boolean(process.env.VERCEL) || req.secure,
        sameSite: 'lax', path: '/api/cloud', maxAge: result.expiresAt - Date.now() });
      res.json(result);
    } catch (error) { next(error); }
  });
  app.get('/api/cloud/auth/session', async (req, res, next) => {
    try { res.json(await service.session(cloudSessionId(req))); }
    catch (error) { next(error); }
  });
  app.post('/api/cloud/auth/logout', async (req, res, next) => {
    try {
      await service.logout(cloudSessionId(req), String(req.headers['x-csrf-token'] || ''));
      res.clearCookie('rodovar_cloud_sid', { path: '/api/cloud', httpOnly: true, secure: Boolean(process.env.VERCEL) || req.secure, sameSite: 'lax' });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}
