import fs from 'node:fs';
import path from 'node:path';
import { archiveAccount } from '../src/server/accountLifecycle';
import type { ServerDatabase } from '../server';

const file = path.join(process.env.RODOVAR_DATA_ROOT || process.cwd(), 'data/rodovar-server-db.json');
const db: ServerDatabase = JSON.parse(fs.readFileSync(file, 'utf8'));
const policy = db.accessPolicy;
if (!policy || policy.authorizedUids.length !== 15 || new Set(policy.authorizedUids).size !== 15 || !policy.authorizedUids.every(uid => db.users.some(u => u.id === uid))) throw Error('A lista autorizada de 15 UIDs não confere. Nenhuma exclusão executada.');
const allowed = new Set([policy.protectedAdminUid, ...policy.authorizedUids]);
const targets = db.users.filter(u => !allowed.has(u.id));
console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'EXECUCAO' : 'PREVIA', keep: allowed.size, remove: targets.map(u => ({ uid: u.id, name: u.name, login: u.login })) }, null, 2));
if (process.argv.includes('--apply') && targets.length) {
  fs.copyFileSync(file, file + '.backup-cleanup-' + Date.now());
  for (const target of targets) archiveAccount(db, target.id, policy.protectedAdminUid, 'Limpeza autorizada: conta fora da lista real de colaboradores.');
  fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(file + '.tmp', file);
}
