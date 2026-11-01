import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

let input='';for await(const chunk of process.stdin)input+=chunk;
const {password}=JSON.parse(input);
const base=process.env.RODOVAR_VERIFY_URL || 'http://127.0.0.1:3000';
const db=JSON.parse(fs.readFileSync('data/rodovar-server-db.json','utf8'));
const roster=db.accessPolicy.authorizedUids.map(uid=>db.users.find(u=>u.id===uid));
assert.equal(roster.length,15);assert.equal(db.users.filter(u=>u.accessLevel==='ADMINISTRADOR').length,1);
assert.equal(new Set(roster.map(u=>u.passwordSalt)).size,15);
const results=[];
for(const u of roster) {
  assert.ok(crypto.timingSafeEqual(crypto.scryptSync(password,Buffer.from(u.passwordSalt,'hex'),64),Buffer.from(u.passwordHash,'hex')));
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:u.login,password,rememberMe:false})});
  const data=await response.json();assert.equal(response.status,200,u.name+': login');assert.equal(data.user.id,u.id);assert.equal(data.user.mustChangePassword,true);
  const headers={'Content-Type':'application/json','X-Rodovar-Session':data.sessionId,'X-CSRF-Token':data.csrfToken};
  const session=await fetch(base+'/api/auth/session',{headers});assert.equal(session.status,200);
  const restricted=await fetch(base+'/api/requests',{headers});assert.equal(restricted.status,403);assert.equal((await restricted.json()).code,'PASSWORD_CHANGE_REQUIRED');
  const reuse=await fetch(base+'/api/profile',{method:'PUT',headers,body:JSON.stringify({password})});assert.equal(reuse.status,400);assert.match((await reuse.json()).error,/diferente/);
  const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers});assert.equal(logout.status,200);
  results.push({name:u.name,login:u.login,profile:u.accessProfile,uid:u.id,active:u.active,authentication:'APROVADA',firstAccess:'TROCA_OBRIGATORIA_VERIFICADA'});
}
fs.writeFileSync('data/activation-verification.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({accountsVerified:results.length,uniqueAdmin:true,individualSalts:true,mandatoryPasswordChange:true,testSessionsClosed:true},null,2));
