import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AUTHORIZED_ROSTER, PROFILE_MODULES } from '../src/lib/accessPolicy';

// Run with the server stopped. Preview is the default; no migration runs on boot.
const root = process.env.RODOVAR_DATA_ROOT || process.cwd();
const file = path.join(root, 'data/rodovar-server-db.json');
const config = JSON.parse(fs.readFileSync(process.argv[2] || 'data/access-bindings.json', 'utf8'));
const raw = fs.readFileSync(file, 'utf8');
const db = JSON.parse(raw);
const admin = db.users.find((u: any) => u.id === config.protectedAdminUid);
if (!admin || admin.accessLevel !== 'ADMINISTRADOR' || !admin.active || admin.login !== config.protectedAdminLogin) throw Error('UID/login do administrador protegido não conferem. Nenhuma alteração.');
const uids = new Set<string>([admin.id]);
const report = AUTHORIZED_ROSTER.map(entry => {
  const uid = config.bindings[entry.name];
  if (!uid) return {...entry, login: '', uid: null, status:'PENDENTE_IDENTIDADE'};
  const user = db.users.find((u: any) => u.id === uid);
  if (!user || uids.has(uid)) throw Error('Vínculo ausente ou duplicado: ' + entry.name);
  uids.add(uid);
  return {...entry, uid, login:user.login, status: user.accessProfile === entry.profile && user.active ? 'ATIVA_LOCAL' : 'PENDENTE_PRIMEIRO_ACESSO'};
});
const disabled = db.users.filter((u: any) => !uids.has(u.id)).map((u: any) => ({uid:u.id, login:u.login}));
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'APLICAR':'PREVIA', protectedAdminUid:admin.id, accounts:report, disable:disabled, historicalAssignments:'Preservadas; revisão administrativa necessária.'}, null, 2));
if (process.argv.includes('--apply')) {
  const stamp = new Date().toISOString();
  fs.copyFileSync(file, file + '.backup-' + Date.now());
  for (const user of db.users) {
    if (user.id === admin.id) continue;
    const entry = report.find(r => r.uid === user.id);
    if (!entry) {
      user.active=false; user.approvalStatus='SUSPENSO';
      if (!user.previousAccessLevel) user.previousAccessLevel=user.accessLevel;
      user.accessLevel='FUNCIONARIO'; user.permissoesPaginas=[];
      user.statusReason='Fora da lista autorizada; histórico preservado.';
    } else {
      const changed = user.accessProfile !== entry.profile;
      user.accessProfile=entry.profile;
      user.accessLevel=entry.profile==='DIRETORIA'?'DIRETORIA':'FUNCIONARIO';
      user.department=['COMERCIAL','EXPEDICAO','MONITORAMENTO'].includes(entry.profile)?'Logística':entry.profile==='RH'?'Recursos Humanos':entry.profile==='FINANCEIRO'?'Financeiro':'Diretoria';
      user.permissoesPaginas=[...PROFILE_MODULES[entry.profile]];
      user.avatar='/assets/aistudio/RODOVAR-LOGO_310056c8.png'; user.hasCustomAvatar=true;
      if (changed) { user.active=false; user.approvalStatus='PENDENTE'; user.mustChangePassword=true; user.passwordHash=''; user.passwordSalt=''; }
    }
  }
  // Revoke previous permissions, reset tokens and sessions on every controlled application.
  db.sessions={}; db.passwordResetTokens=[];
  db.accessPolicy={protectedAdminUid:admin.id, authorizedUids:[...uids].filter(id=>id!==admin.id), version:1};
  db.systemConfig.defaultAvatar={...db.systemConfig.defaultAvatar,imageUrl:'/assets/aistudio/RODOVAR-LOGO_310056c8.png'};
  const key=crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
  if (!db.auditLogs.some((a:any)=>a.migrationKey===key)) db.auditLogs.unshift({id:crypto.randomUUID(),timestampIso:stamp,actorId:admin.id,actorName:admin.name,actorRole:'ADMINISTRADOR',action:'MIGRACAO_ACESSOS',details:'Perfis aplicados; históricos preservados; sessões revogadas.',migrationKey:key});
  fs.writeFileSync(file+'.tmp',JSON.stringify(db,null,2)); fs.renameSync(file+'.tmp',file);
  fs.writeFileSync(path.join(root,'data/access-report.json'),JSON.stringify(report,null,2));
}
