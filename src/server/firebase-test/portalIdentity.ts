import { firebaseTestRuntime } from './runtime';

export interface FirebasePortalIdentity {
  uid: string;
  email: string;
  employeeId: string;
}

/**
 * Validates a Firebase Emulator ID token and resolves it to an approved portal
 * profile. This module is intentionally emulator-only; runtime.ts fails closed
 * if any production, Vercel or remote-emulator setting is present.
 */
export async function verifyFirebasePortalIdentity(
  authorizationHeader: string | undefined
): Promise<FirebasePortalIdentity> {
  const match = /^Bearer ([^ ]+)$/.exec(String(authorizationHeader || ''));
  if (!match) {
    throw Object.assign(new Error('Sessão Firebase ausente.'), { status: 401 });
  }

  const { auth, db } = firebaseTestRuntime();
  let token;
  try {
    token = await auth.verifyIdToken(match[1], true);
  } catch {
    throw Object.assign(new Error('Sessão Firebase inválida ou expirada.'), { status: 401 });
  }

  const snapshot = await db.collection('portalUsers').doc(token.uid).get();
  if (!snapshot.exists) {
    throw Object.assign(new Error('Perfil corporativo não autorizado.'), { status: 403 });
  }

  const profile = snapshot.data() || {};
  if (!profile.active || profile.approvalStatus !== 'APROVADO') {
    throw Object.assign(new Error('Conta inativa ou não aprovada.'), { status: 403 });
  }

  const employeeId = String(profile.employeeId || token.uid).trim();
  if (!employeeId) {
    throw Object.assign(new Error('Perfil sem vínculo com o cadastro corporativo.'), {
      status: 403,
    });
  }

  return {
    uid: token.uid,
    email: String(token.email || profile.email || '').trim().toLowerCase(),
    employeeId,
  };
}
