import type { Firestore, Transaction } from 'firebase-admin/firestore';

type Actor = { id: string; accessLevel: string };

export function actorOf(req: unknown): Actor {
  return (req as { sessionUser: Actor }).sessionUser;
}

export function requireAdmin() {
  return Object.assign(new Error('Operação exclusiva do administrador principal.'), { status: 403 });
}

export async function requireProtectedAdmin(tx: Transaction, db: Firestore, actor: Actor) {
  if (actor.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
  const [security, user] = await tx.getAll(
    db.collection('system_settings').doc('security'), db.collection('users').doc(actor.id),
  );
  const account = user.data();
  if (security.data()?.protectedAdminUid !== actor.id || !account?.active ||
      account.approvalStatus !== 'APROVADO' || account.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
}
