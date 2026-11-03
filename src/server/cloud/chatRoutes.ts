import type { Express, RequestHandler } from 'express';
import type { FirestoreChatService } from './chat';

/** Mount only behind a verified cloud session guard; no client-supplied actor UID. */
export function registerCloudChatRoutes(app: Express, guard: RequestHandler, service: FirestoreChatService) {
  const route = (action: (req: any) => Promise<unknown>): RequestHandler => async (req: any, res, next) => {
    if (!req.sessionUser?.id) { res.status(401).json({ error: 'Entre para acessar.' }); return; }
    try { res.json(await action(req)); } catch (error) { next(error); }
  };
  app.get('/api/cloud/chat/conversations', guard, route(req => service.list(req.sessionUser.id)));
  app.get('/api/cloud/chat/conversations/:id/messages', guard, route(req =>
    service.messages(req.sessionUser.id, req.params.id, req.query.before === undefined ? undefined : Number(req.query.before))));
  app.post('/api/cloud/chat/conversations', guard, route(req => service.create(req.sessionUser.id, {
    participants: req.body?.participants, name: req.body?.name, isGroup: req.body?.isGroup,
    key: String(req.headers['x-idempotency-key'] || ''),
  })));
  app.post('/api/cloud/chat/conversations/:id/messages', guard, route(req =>
    service.send(req.sessionUser.id, req.params.id, req.body?.text, String(req.headers['x-idempotency-key'] || ''))));
  app.post('/api/cloud/chat/conversations/:id/read', guard, route(req =>
    service.read(req.sessionUser.id, req.params.id, req.body?.sequence)));
  app.patch('/api/cloud/chat/messages/:id', guard, route(req =>
    service.updateMessage(req.sessionUser.id, req.params.id, req.body?.text)));
  app.delete('/api/cloud/chat/messages/:id', guard, route(req =>
    service.updateMessage(req.sessionUser.id, req.params.id, null)));
  app.patch('/api/cloud/chat/conversations/:id', guard, route(req => service.updateGroup(req.sessionUser.id, req.params.id, req.body || {})));
  app.post('/api/cloud/chat/messages/:id/decoration', guard, route(req => service.decorate(req.sessionUser.id, req.params.id, req.body || {})));
}
