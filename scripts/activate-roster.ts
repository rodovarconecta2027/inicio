import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AUTHORIZED_ROSTER, PROFILE_MODULES } from '../src/lib/accessPolicy';

// Explicit, offline operation. Password is accepted via stdin and never written to logs or source files.
const root = process.env.RODOVAR_DATA_ROOT || process.cwd();
const file = path.join(root, 'data/rodovar-server-db.json');
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const config = JSON.parse(fs.readFileSync(process.argv[2] || 'data/roster-activation.json', 'utf8'));
const admin = db.users.find((u: any) => u.id === config.protectedAdminUid);
if (!admin || admin.id !== db.accessPolicy?.protectedAdminUid || admin.login !== config.protectedAdminLogin || admin.accessLevel !== 'ADMINISTRADOR' || !admin.active) throw Error('Administrador protegido não confere.');
const seen = new Set([admin.id]);
const plan = AUTHORIZED_ROSTER.map(entry => {
  const binding = config.accounts[entry.name];
  if (!binding) throw Error('Identidade não revisada: ' + entry.name);
  let user = db.users.find((u: any) => u.id === binding.uid);
  if (!user && !binding.createNew) throw Error('UID existente não encontrado: ' + entry.name);
  if (user && binding.createNew && user.name !== entry.name) throw Error('Colisão de identidade: ' + entry.name);
  if (!user && db.users.some((u: any) => u.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase() === entry.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())) throw Error('Nome já cadastrado; revise o UID: ' + entry.name);
  if (seen.has(binding.uid)) throw Error('UID duplicado.');
  seen.add(binding.uid);
  const login = user?.login || binding.login;
  if (!login || db.users.some((u: any) => u.id !== binding.uid && (u.login === login || u.email === login))) throw Error('Login inválido ou já cadastrado: ' + entry.name);
  return { ...entry, uid: binding.uid, login, createNew: !user };
});
if (new Set(plan.map(p => p.login)).size !== 15) throw Error('Logins duplicados no plano.');
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'APLICAR':'PREVIA',accounts:plan,protectedAdminUid:admin.id},null,2));
if (process.argv.includes('--apply')) {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const password = JSON.parse(input).password;
  if (typeof password !== 'string' || !crypto.timingSafeEqual(crypto.scryptSync(password,Buffer.from(admin.passwordSalt,'hex'),64),Buffer.from(admin.passwordHash,'hex'))) throw Error('A senha inicial deve corresponder ao administrador protegido.');
  fs.copyFileSync(file,file+'.backup-activation-'+Date.now());
  const stamp=new Date().toISOString();
  for (const entry of plan) {
    let user=db.users.find((u:any)=>u.id===entry.uid);
    if (!user) {
      user={id:entry.uid,name:entry.name,login:entry.login,email:'',phone:'',phoneExt:'',location:'',joinedAt:stamp.slice(0,10),requestedAt:stamp};
      db.users.push(user);
    }
    user.name=entry.name==='Petrônio'?user.name:entry.name;
    user.accessProfile=entry.profile;
    user.accessLevel=entry.profile==='DIRETORIA'?'DIRETORIA':'FUNCIONARIO';
    user.department=['COMERCIAL','EXPEDICAO','MONITORAMENTO'].includes(entry.profile)?'Logística':entry.profile==='RH'?'Recursos Humanos':entry.profile==='FINANCEIRO'?'Financeiro':'Diretoria';
    user.roleTitle=entry.profile;
    user.permissoesPaginas=[...PROFILE_MODULES[entry.profile]];
    user.avatar='/assets/aistudio/RODOVAR-LOGO_310056c8.png';user.hasCustomAvatar=true;
    user.active=true;user.approvalStatus='APROVADO';user.approvedBy=admin.id;user.approvedAt ||= stamp;user.statusReason='Ativação autorizada pelo administrador.';
    if (!user.rosterActivationVersion) {
      user.passwordSalt=crypto.randomBytes(16).toString('hex');
      user.passwordHash=crypto.scryptSync(password,Buffer.from(user.passwordSalt,'hex'),64).toString('hex');
      user.mustChangePassword=true;user.rosterActivationVersion=1;
    }
  }
  for (const user of db.users) if (!seen.has(user.id)) {user.active=false;user.approvalStatus='SUSPENSO';user.accessLevel='FUNCIONARIO';user.permissoesPaginas=[];}
  for(const [sid,session] of Object.entries(db.sessions) as [string,any][]) if(session.userId!==admin.id) delete db.sessions[sid];
  db.passwordResetTokens=db.passwordResetTokens.filter((t:any)=>t.userId===admin.id);
  for (const entry of plan) {delete db.loginLocks['user:'+entry.uid];delete db.loginLocks[entry.login];}
  db.accessPolicy.authorizedUids=plan.map(p=>p.uid);
  db.auditLogs.unshift({id:crypto.randomUUID(),timestampIso:stamp,actorId:admin.id,actorName:admin.name,actorRole:'ADMINISTRADOR',action:'ATIVACAO_LISTA_AUTORIZADA',details:'15 contas aprovadas; senha inicial autorizada pelo titular com troca obrigatória. Nenhuma senha ou token registrado.'});
  fs.writeFileSync(file+'.tmp',JSON.stringify(db,null,2));fs.renameSync(file+'.tmp',file);
  fs.writeFileSync(path.join(root,'data/access-bindings.json'),JSON.stringify({protectedAdminUid:admin.id,protectedAdminLogin:admin.login,bindings:Object.fromEntries(plan.map(p=>[p.name,p.uid]))},null,2));
  fs.writeFileSync(path.join(root,'data/access-report.json'),JSON.stringify(plan.map(p=>({...p,status:'ATIVA_LOCAL_TROCA_OBRIGATORIA'})),null,2));
}
