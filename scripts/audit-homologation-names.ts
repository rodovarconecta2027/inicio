import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { AUTHORIZED_ROSTER, officialRosterName } from '../src/lib/accessPolicy.js';
import { privateIdentifierKey } from '../src/server/cloud/authService.js';
import { HOMOLOGATION_PROJECT } from '../src/server/cloud/runtime.js';

async function main() {
  const apply = process.argv.includes('--apply');
  if (process.argv.length > (apply ? 3 : 2)) throw Error('Unknown audit argument');
  if (process.env.VERCEL || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)
    throw Error('Local read-only audit only');
  const require = createRequire(import.meta.url);
  const { requireAuth } = require('firebase-tools/lib/requireAuth');
  const { getGlobalDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth');
  const operator = getGlobalDefaultAccount();
  if (!operator) throw Error('Firebase CLI authorization required');
  await requireAuth({ project: HOMOLOGATION_PROJECT, ...operator });
  const token = await getAccessToken(operator.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const client = new OAuth2Client();
  client.setCredentials({ access_token: token.access_token, expiry_date: token.expires_at });
  const app = initializeApp({ projectId: HOMOLOGATION_PROJECT, credential: {
    getAccessToken: async () => ({ access_token: token.access_token, expires_in: 300 }),
  } }, 'roster-name-audit');
  const auth = getAuth(app);
  const db = new Firestore({ projectId: HOMOLOGATION_PROJECT, auth: new GoogleAuth({ authClient: client }), preferRest: true });
  try {
    const security = (await db.collection('system_settings').doc('security').get()).data();
    const adminUid = security?.protectedAdminUid;
    if (!adminUid) throw Error('Protected administrator UID unavailable');
    const entries = [{ name: 'Administrador Geral RODOVAR', slot: '', profile: 'ADMINISTRADOR', uid: adminUid }];
    for (const person of AUTHORIZED_ROSTER) {
      const slot = privateIdentifierKey(person.name).slice(0, 24);
      const assignment = (await db.collection('roster_assignments').doc(slot).get()).data();
      entries.push({ ...person, name: officialRosterName(person.name),
        slot, uid: assignment?.uid || '' });
    }
    const rows = [];
    const targets: { uid: string; name: string; currentName: string; authName: string; slot: string }[] = [];
    for (const entry of entries) {
      if (!entry.uid) { rows.push({ proposedName: entry.name, profile: entry.profile, linked: false }); continue; }
      const [record, profile, account] = await Promise.all([
        auth.getUser(entry.uid),
        db.collection('employee_profiles').doc(entry.uid).get(),
        db.collection('users').doc(entry.uid).get(),
      ]);
      const currentName = String(profile.data()?.name || '');
      const authName = record.displayName || '';
      const linked = entry.slot ? account.data()?.rosterSlot === entry.slot : account.data()?.accessLevel === 'ADMINISTRADOR';
      rows.push({ uid: entry.uid, login: profile.data()?.login || '', currentProfileName: currentName,
        accountName: account.data()?.name || '',
        authDisplayName: authName, proposedName: entry.name, profile: entry.profile,
        rosterSlotMatches: linked,
        active: account.data()?.active === true && !record.disabled, linked: true });
      if (!linked || !account.data()?.active || account.data()?.approvalStatus !== 'APROVADO' || record.disabled ||
          (entry.slot ? !currentName.startsWith('Colaborador de teste · hml.') && currentName !== entry.name :
            !['Administrador de Homologação', entry.name].includes(currentName)) ||
          (entry.slot ? authName !== currentName && authName !== entry.name : authName && authName !== entry.name) ||
          (account.data()?.name && account.data()?.name !== entry.name))
        throw Error(`Identity changed; review UID ${entry.uid}`);
      targets.push({ uid: entry.uid, name: entry.name, currentName, authName, slot: entry.slot });
    }
    if (rows.length !== 16 || targets.length !== 16 || new Set(targets.map(row => row.uid)).size !== 16)
      throw Error('Expected exactly 16 unique linked accounts');
    if (apply) {
      for (const target of targets) {
        if (target.authName !== target.name) await auth.updateUser(target.uid, { displayName: target.name });
        if (target.currentName !== target.name) {
          await db.runTransaction(async tx => {
            const ref = db.collection('employee_profiles').doc(target.uid);
            const linkRef = target.slot ? db.collection('roster_assignments').doc(target.slot) : null;
            const [profile, link] = await Promise.all([tx.get(ref), linkRef ? tx.get(linkRef) : Promise.resolve(null)]);
            if (profile.data()?.name !== target.currentName || (link && link.data()?.uid !== target.uid))
              throw Error(`Identity changed during sync; review UID ${target.uid}`);
            tx.update(ref, { name: target.name });
            tx.create(db.collection('audit_logs').doc(), { action: 'HOMOLOGATION_OFFICIAL_NAME_SYNCED',
              actorId: adminUid, targetId: target.uid, atIso: new Date().toISOString() });
          });
        }
      }
      for (const target of targets) {
        const [record, profile] = await Promise.all([auth.getUser(target.uid),
          db.collection('employee_profiles').doc(target.uid).get()]);
        if (record.displayName !== target.name || profile.data()?.name !== target.name)
          throw Error(`Verification failed for UID ${target.uid}`);
      }
    }
    console.log(JSON.stringify({ project: HOMOLOGATION_PROJECT, applied: apply, verified: apply ? targets.length : 0,
      rows: apply ? rows.map(row => ({ uid: row.uid, login: row.login, name: row.proposedName })) : rows }, null, 2));
  } finally { await db.terminate(); }
}

main().catch(error => { console.error('AUDIT_FAILED: ' + String(error?.message || error?.code || 'unknown').slice(0, 200)); process.exitCode = 1; });
