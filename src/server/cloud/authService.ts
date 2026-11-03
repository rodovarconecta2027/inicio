import crypto from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { loadCloudIdentity } from './identity.js';

export const privateIdentifierKey = (identifier: string) => crypto.createHash('sha256').update(identifier.trim().normalize('NFKC').toLowerCase()).digest('hex');
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const error = (message: string, status: number, code: string, details = {}) => Object.assign(Error(message), { status, code, ...details });
type Runtime = { auth: Auth; db: Firestore };
type VerifyPassword = (email: string, password: string) => Promise<string>;
const invalid = () => error('Não foi possível entrar. Confira os dados de acesso.', 401, 'INVALID_CREDENTIALS');

/** Firebase validates passwords; this service controls corporate admission and sessions. */
export class CloudAuthService {
  constructor(private readonly runtime: Runtime, private readonly verifyPassword: VerifyPassword) {}

  async lockStatus(identifier: string) {
    const now = Date.now();
    const mapping = (await this.runtime.db.collection('auth_identifiers').doc(privateIdentifierKey(identifier)).get()).data();
    const key = privateIdentifierKey(mapping?.uid ? 'uid:' + mapping.uid : 'identifier:' + identifier);
    const snapshot = await this.runtime.db.collection('auth_attempts').doc(key).get();
    const blockedUntil = Number(snapshot.data()?.blockedUntil || 0);
    return { locked: blockedUntil > now, blockedUntil: blockedUntil > now ? blockedUntil : null,
      serverNow: now, remainingSeconds: Math.max(0, Math.ceil((blockedUntil - now) / 1000)) };
  }

  private async reserveAttempt(key: string) {
    const ref = this.runtime.db.collection('auth_attempts').doc(key);
    return this.runtime.db.runTransaction(async tx => {
      const saved = (await tx.get(ref)).data() || {};
      const now = Date.now();
      if (saved.blockedUntil > now) throw error('Aguarde o prazo indicado para tentar novamente.', 429, 'LOGIN_LOCKED', {
        locked: true, blockedUntil: saved.blockedUntil, serverNow: now, remainingSeconds: Math.ceil((saved.blockedUntil - now) / 1000),
      });
      const count = saved.windowStartedAt > now - 120000 ? Number(saved.count || 0) + 1 : 1;
      const blockedUntil = count >= 5 ? now + 120000 : 0;
      tx.set(ref, { count, blockedUntil, windowStartedAt: count === 1 ? now : saved.windowStartedAt });
      return { ref, count, blockedUntil };
    });
  }

  async login(input: { identifier: string; password: string; rememberMe?: boolean }) {
    const { identifier, password } = input || {};
    if (typeof identifier !== 'string' || identifier.trim().length < 3 || identifier.length > 254 ||
        typeof password !== 'string' || !password || password.length > 1024) throw error('Informe usuário e senha corporativa.', 400, 'INVALID_LOGIN_INPUT');
    const mapping = (await this.runtime.db.collection('auth_identifiers').doc(privateIdentifierKey(identifier)).get()).data();
    const attempt = await this.reserveAttempt(privateIdentifierKey(mapping?.uid ? 'uid:' + mapping.uid : 'identifier:' + identifier));
    // No public username directory or automatic account creation. Email logins
    // also require an explicitly provisioned corporate identifier binding.
    if (!mapping?.uid || typeof mapping.email !== 'string') {
      await this.recordFailure(identifier);
      throw Object.assign(invalid(), { remainingAttempts: Math.max(0, 5 - attempt.count), locked: attempt.count >= 5,
        blockedUntil: attempt.blockedUntil || null, remainingSeconds: attempt.count >= 5 ? 120 : 0 });
    }
    let token;
    try {
      const idToken = await this.verifyPassword(mapping.email, password);
      token = await this.runtime.auth.verifyIdToken(idToken, true);
      if (token.uid !== mapping.uid) throw invalid();
    } catch (cause: any) {
      if (cause.status === 503) {
        await this.runtime.db.runTransaction(async tx => {
          const current = await tx.get(attempt.ref);
          if (current.exists) tx.update(attempt.ref, { count: Math.max(0, Number(current.data()!.count || 0) - 1), blockedUntil: 0 });
        });
        throw cause;
      }
      await this.recordFailure(identifier);
      throw Object.assign(invalid(), { remainingAttempts: Math.max(0, 5 - attempt.count), locked: attempt.count >= 5,
        blockedUntil: attempt.blockedUntil || null, remainingSeconds: attempt.count >= 5 ? 120 : 0 });
    }
    const { user } = await loadCloudIdentity(this.runtime, token.uid);
    const sessionId = crypto.randomBytes(32).toString('hex'), csrfToken = crypto.randomBytes(24).toString('hex');
    const now = Date.now(), expiresAt = now + (input.rememberMe ? 14 : 1) * 86400000;
    const batch = this.runtime.db.batch();
    batch.set(this.runtime.db.collection('auth_sessions').doc(digest(sessionId)), {
      uid: token.uid, csrfToken, authTime: token.auth_time, createdAt: now, expiresAt,
    });
    batch.set(attempt.ref, { count: 0, blockedUntil: 0, windowStartedAt: now });
    batch.create(this.runtime.db.collection('audit_logs').doc(), { actorId: token.uid, action: 'AUTH_LOGIN', atIso: new Date(now).toISOString() });
    await batch.commit();
    const config = (await this.runtime.db.collection('system_settings').doc('portal').get()).data()?.config;
    return { ok: true, authenticated: true, user, sessionId, csrfToken, expiresAt, ...(config ? { systemConfig: config } : {}) };
  }

  private async recordFailure(identifier: string) {
    await this.runtime.db.collection('audit_logs').add({ identifierHash: privateIdentifierKey(identifier), action: 'AUTH_LOGIN_FAILED', atIso: new Date().toISOString() });
  }

  async session(sessionId: string) {
    if (!/^[a-f0-9]{64}$/.test(sessionId || '')) throw error('Entre para acessar.', 401, 'AUTH_REQUIRED');
    const saved = (await this.runtime.db.collection('auth_sessions').doc(digest(sessionId)).get()).data();
    if (!saved || saved.expiresAt <= Date.now()) throw error('Sessão expirada.', 401, 'SESSION_EXPIRED');
    let identity: Awaited<ReturnType<typeof loadCloudIdentity>>;
    try { identity = await loadCloudIdentity(this.runtime, saved.uid); }
    catch (cause: any) {
      if (cause.status === 403 || ['auth/user-not-found', 'auth/user-disabled'].includes(cause.code)) {
        await this.runtime.db.collection('auth_sessions').doc(digest(sessionId)).delete();
      }
      throw cause;
    }
    const { user, account } = identity;
    if (saved.authTime < Math.floor(Date.parse(account.tokensValidAfterTime || '1970-01-01T00:00:00Z') / 1000)) throw error('Sessão revogada.', 401, 'SESSION_REVOKED');
    const config = (await this.runtime.db.collection('system_settings').doc('portal').get()).data()?.config;
    return { authenticated: true, user, sessionId, csrfToken: saved.csrfToken, expiresAt: saved.expiresAt, ...(config ? { systemConfig: config } : {}) };
  }

  async logout(sessionId: string, csrfToken: string) {
    const current = await this.session(sessionId);
    if (csrfToken !== current.csrfToken) throw error('Atualize a sessão antes de continuar.', 403, 'CSRF_INVALID');
    const batch = this.runtime.db.batch();
    batch.delete(this.runtime.db.collection('auth_sessions').doc(digest(sessionId)));
    batch.create(this.runtime.db.collection('audit_logs').doc(), { actorId: current.user.id, action: 'AUTH_LOGOUT', atIso: new Date().toISOString() });
    await batch.commit();
  }

  async updateProfile(sessionId: string, csrf: string, input: { name?: unknown; phoneExt?: unknown }) {
    const current = await this.session(sessionId);
    if (csrf !== current.csrfToken || current.user.mustChangePassword)
      throw error('Atualize a sessão e confirme o primeiro acesso.', 403, 'PROFILE_FORBIDDEN');
    const name = typeof input.name === 'string' ? input.name.trim() : current.user.name;
    const phoneExt = typeof input.phoneExt === 'string' ? input.phoneExt.trim() : current.user.phoneExt;
    if (name.length < 3 || name.length > 120 || /[<>]/.test(name) || phoneExt.length > 40 || /[^0-9+() .-]/.test(phoneExt))
      throw error('Confira o nome e o telefone corporativo.', 400, 'INVALID_PROFILE');
    const batch = this.runtime.db.batch();
    batch.update(this.runtime.db.collection('employee_profiles').doc(current.user.id), { name, phoneExt });
    batch.create(this.runtime.db.collection('audit_logs').doc(), { actorId: current.user.id, action: 'PROFILE_UPDATED', atIso: new Date().toISOString() });
    await batch.commit();
    return { ok: true, user: { ...current.user, name, phoneExt } };
  }

  async firstPassword(sessionId: string, csrf: string, password: string) {
    const current = await this.session(sessionId);
    if (csrf !== current.csrfToken) throw error('Atualize a sessão.', 403, 'CSRF_INVALID');
    const ref = this.runtime.db.collection('auth_sessions').doc(digest(sessionId));
    const saved = (await ref.get()).data();
    if (!current.user.mustChangePassword || !saved || saved.authTime * 1000 < Date.now() - 300000)
      throw error('Entre novamente para definir a senha de primeiro acesso.', 403, 'REAUTH_REQUIRED');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
      throw error('Use uma senha pessoal com 12 a 128 caracteres.', 400, 'INVALID_PASSWORD');
    let same = false;
    try { await this.verifyPassword(current.user.email, password); same = true; }
    catch (cause: any) { if (cause.status !== 401) throw cause; }
    if (same) throw error('A nova senha deve ser diferente da inicial.', 400, 'PASSWORD_UNCHANGED');
    // Invalidate corporate sessions before changing the Firebase credential.
    const sessions = await this.runtime.db.collection('auth_sessions').where('uid', '==', current.user.id).get();
    for (const doc of sessions.docs) await doc.ref.delete();
    await this.runtime.auth.updateUser(current.user.id, { password });
    await this.runtime.auth.revokeRefreshTokens(current.user.id);
    await this.runtime.db.collection('users').doc(current.user.id).update({ mustChangePassword: false });
    await this.runtime.db.collection('audit_logs').add({ actorId: current.user.id, action: 'FIRST_PASSWORD_CHANGED', atIso: new Date().toISOString() });
    return this.login({ identifier: current.user.email, password });
  }
}

/** No arbitrary authentication URL is accepted from a request. */
export function firebasePasswordVerifier(options: { projectId: string; apiKey: string; emulator?: boolean }): VerifyPassword {
  if (!options.apiKey || options.emulator && options.projectId !== 'demo-rodovar-conecta') throw Error('Configuração de autenticação inválida.');
  const endpoint = options.emulator
    ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'
    : 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
  return async (email, password) => {
    let response: Response;
    try {
      response = await fetch(endpoint + '?key=' + encodeURIComponent(options.apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(15000),
      });
    } catch { throw error('O serviço de autenticação está indisponível. Tente novamente.', 503, 'AUTH_UNAVAILABLE'); }
    const data = await response.json();
    if (response.status >= 500 || response.status === 429) throw error('O serviço de autenticação está indisponível. Tente novamente.', 503, 'AUTH_UNAVAILABLE');
    if (!response.ok || typeof data.idToken !== 'string') throw invalid();
    return data.idToken;
  };
}
