import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

export async function loadCloudIdentity(runtime: { auth: Auth; db: Firestore }, uid: string) {
  const account = await runtime.auth.getUser(uid);
  const [userSnapshot, profileSnapshot] = await Promise.all([
    runtime.db.collection('users').doc(uid).get(), runtime.db.collection('employee_profiles').doc(uid).get(),
  ]);
  const user = userSnapshot.data(), profile = profileSnapshot.data();
  if (account.disabled || !user?.active || user.approvalStatus !== 'APROVADO' || !profile) {
    throw Object.assign(Error('Conta sem liberação para o portal.'), { status: 403, code: 'ACCOUNT_NOT_APPROVED' });
  }
  if (user.accessLevel === 'ADMINISTRADOR') {
    const policy = (await runtime.db.collection('system_settings').doc('security').get()).data();
    if (policy?.protectedAdminUid !== uid) throw Object.assign(Error('Administrador não autorizado.'), { status: 403 });
  }
  return {
    account,
    user: {
      id: uid, name: profile.name, email: account.email || '', login: profile.login || account.email || '',
      department: profile.department, roleTitle: profile.roleTitle,
      phone: profile.phone || '', phoneExt: profile.phoneExt || '', location: profile.location || '',
      joinedAt: profile.joinedAt || '', avatar: profile.avatar || '/assets/default-avatar.png',
      accessProfile: user.accessProfile, accessLevel: user.accessLevel,
      permissoesPaginas: user.permissoesPaginas || [], active: true, approvalStatus: 'APROVADO',
      mustChangePassword: user.mustChangePassword === true,
    },
  };
}
