import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {initializeApp as initializeClient,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,getDoc,doc,setDoc} from 'firebase/firestore';
import {assertEmulatorEnvironment} from '../src/server/firebase-test/runtime';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('Configuração falha fechada: produção, projeto real e emuladores remotos são recusados',()=>{
 const valid:any={RODOVAR_FIREBASE_ENV:'emulator',GCLOUD_PROJECT:'demo-rodovar-conecta',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};assert.doesNotThrow(()=>assertEmulatorEnvironment(valid));
 for(const patch of [{NODE_ENV:'production'},{GCLOUD_PROJECT:'production-real'},{FIRESTORE_EMULATOR_HOST:'cloud.example:8080'},{VERCEL:'1'},{GOOGLE_APPLICATION_CREDENTIALS:'service-account.json'}])assert.throws(()=>assertEmulatorEnvironment({...valid,...patch}));
});

test('Firebase real nos emuladores: senha, token, perfis, transações, isolamento, regras e persistência',async()=>{
 process.env.RODOVAR_FIREBASE_ENV='emulator';process.env.GCLOUD_PROJECT='demo-rodovar-conecta';
 const {firebaseTestRuntime}=await import('../src/server/firebase-test/runtime');const {auth,db}=firebaseTestRuntime();const {createFirebaseTestApi}=await import('../src/server/firebase-test/api');
 const identities=[['test-master','ADMINISTRADOR','RH'],['test-com1','FUNCIONARIO','MONITORAMENTO'],['test-com2','FUNCIONARIO','MONITORAMENTO'],['test-rh1','FUNCIONARIO','RH'],['test-rh2','FUNCIONARIO','RH'],['test-mon','FUNCIONARIO','MONITORAMENTO'],['test-fin','FUNCIONARIO','FINANCEIRO'],['test-dir','DIRETORIA','DIRETORIA']];const tokens=new Map<string,string>(),clients:any[]=[];
 for(const [uid,accessLevel,accessProfile] of identities){const email=uid+'@example.test',password=crypto.randomBytes(20).toString('base64url');try{await auth.deleteUser(uid);}catch{}await auth.createUser({uid,email,password,emailVerified:true});await db.collection('portalUsers').doc(uid).set({name:uid,email,active:true,approvalStatus:'APROVADO',accessProfile,accessLevel,department:accessProfile==='RH'?'Recursos Humanos':'Logística',roleTitle:accessProfile});
 const app=initializeClient({projectId:'demo-rodovar-conecta',apiKey:'emulator-only',authDomain:'demo-rodovar-conecta.firebaseapp.com'},uid);clients.push(app);const clientAuth=getAuth(app);connectAuthEmulator(clientAuth,'http://127.0.0.1:9099',{disableWarnings:true});const store=getFirestore(app);connectFirestoreEmulator(store,'127.0.0.1',8080);const credential=await signInWithEmailAndPassword(clientAuth,email,password);tokens.set(uid,await credential.user.getIdToken());if(uid==='test-com1')await assert.rejects(signInWithEmailAndPassword(clientAuth,email,'incorrect-password'));
 }
 const server=createFirebaseTestApi().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 const call=(uid:string,path:string,body?:any,key='one-operation')=>fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+(tokens.get(uid)||'invalid'),'Content-Type':'application/json','X-Idempotency-Key':key},body:body?JSON.stringify(body):undefined});
 try{
 assert.equal((await call('unknown','/session')).status,401);assert.equal((await call('test-com1','/session')).status,200);assert.equal((await call('test-com1','/admin/profiles')).status,403);assert.equal((await call('test-dir','/admin/profiles')).status,403);assert.equal((await call('test-master','/admin/profiles')).status,200);
 const body={subject:'Solicitação fictícia',description:'Teste isolado de persistência',targetDepartment:'RH'};const created=await (await call('test-com1','/requests',body)).json();const id=created.request.id;const repeated=await (await call('test-com1','/requests',body)).json();assert.equal(repeated.request.id,id);
 assert.equal((await (await call('test-com2','/requests')).json()).requests.length,0);for(const rh of ['test-rh1','test-rh2']){assert.ok((await (await call(rh,'/requests')).json()).requests.some((r:any)=>r.id===id));assert.equal((await db.collection('notifications').where('recipientId','==',rh).where('targetId','==',id).get()).size,1);}
 const claims=await Promise.all(['test-rh1','test-rh2'].map(u=>call(u,'/requests/'+id+'/claim',{})));assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);assert.equal((await call('test-com2','/requests/'+id+'/claim',{})).status,403);
 const comStore=getFirestore(clients[1]),otherStore=getFirestore(clients[2]);await getDoc(doc(comStore,'requests',id));await assert.rejects(getDoc(doc(otherStore,'requests',id)));await assert.rejects(setDoc(doc(comStore,'portalUsers','test-com1'),{accessLevel:'ADMINISTRADOR'},{merge:true}));await assert.rejects(setDoc(doc(comStore,'requests',id),{status:'Concluída'},{merge:true}));
 await db.collection('financial').doc('test-freight').set({amount:100});await assert.rejects(getDoc(doc(getFirestore(clients[5]),'financial','test-freight')));assert.ok((await getDoc(doc(getFirestore(clients[6]),'financial','test-freight'))).exists());await assert.rejects(setDoc(doc(getFirestore(clients[6]),'financial','test-freight'),{paid:true},{merge:true}));
 await db.collection('portalUsers').doc('test-com2').update({active:false});assert.equal((await call('test-com2','/session')).status,403);await assert.rejects(getDoc(doc(otherStore,'portalUsers','test-com2')));
 const second=createFirebaseTestApi().listen(0,'127.0.0.1');await new Promise<void>(r=>second.once('listening',r));try{const r=await fetch('http://127.0.0.1:'+(second.address() as any).port+'/api/requests',{headers:{Authorization:'Bearer '+tokens.get('test-com1')}});assert.ok((await r.json()).requests.some((v:any)=>v.id===id));}finally{await new Promise<void>(r=>second.close(()=>r()));}
 }finally{await new Promise<void>(r=>server.close(()=>r()));await Promise.all(clients.map(deleteApp));}
});

test('Ponte do portal: token Firebase fictício gera a sessão existente sem alterar permissões',async()=>{
 process.env.RODOVAR_FIREBASE_ENV='emulator';process.env.GCLOUD_PROJECT='demo-rodovar-conecta';
 const {firebaseTestRuntime}=await import('../src/server/firebase-test/runtime');const {auth,db}=firebaseTestRuntime();
 const uid='test-portal-user',email='portal-bridge@example.test',password=crypto.randomBytes(24).toString('base64url');
 try{await auth.deleteUser(uid);}catch{}
 await auth.createUser({uid,email,password,emailVerified:true});
 await db.collection('portalUsers').doc(uid).set({employeeId:uid,name:'Colaborador Fictício',email,active:true,approvalStatus:'APROVADO',accessProfile:'MONITORAMENTO',accessLevel:'FUNCIONARIO',department:'Logística',roleTitle:'Monitoramento'});
 const root=await mkdtemp(path.join(tmpdir(),'rodovar-firebase-portal-'));
 const port=3197;
 const user={id:uid,name:'Colaborador Fictício',email,login:'portal.bridge',passwordHash:'00',passwordSalt:'00',mustChangePassword:false,roleTitle:'Monitoramento',department:'Logística',accessLevel:'FUNCIONARIO',accessProfile:'MONITORAMENTO',avatar:'',hasCustomAvatar:false,approvalStatus:'APROVADO',requestedAt:new Date().toISOString(),phoneExt:'',joinedAt:'2026-01-01',active:true,location:'',phone:'',permissoesPaginas:['inicio','fretes_ativos','solicitacoes','agenda','mensagens','grupos','diretorio','perfil','ajuda']};
 const systemConfig={revision:1,updatedAtIso:new Date().toISOString(),updatedBy:'Teste',sidebarPoster:{imageUrl:'/assets/test.png',focusX:50,focusY:50},topHeader:{imageUrl:'/assets/test.png',focusX:50,focusY:50},welcomeBanner:{carouselEnabled:false,intervalSeconds:5,items:[]},defaultAvatar:{imageUrl:'/assets/default-avatar.png'}};
 await mkdir(path.join(root,'data'),{recursive:true});await mkdir(path.join(root,'public','assets'),{recursive:true});
 await writeFile(path.join(root,'data','rodovar-server-db.json'),JSON.stringify({accessPolicy:{protectedAdminUid:'test-master',authorizedUids:[uid],version:1},users:[user],loginLocks:{},sessions:{},passwordResetTokens:[],accessDecisions:[],auditLogs:[],systemConfig}));
 const child=spawn(process.execPath,['--import','tsx','server.ts'],{cwd:process.cwd(),env:{...process.env,RODOVAR_DATA_ROOT:root,PORT:String(port),HOST:'127.0.0.1',RODOVAR_FIREBASE_ENV:'emulator',GCLOUD_PROJECT:'demo-rodovar-conecta',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',VITE_RODOVAR_AUTH_PROVIDER:'firebase-emulator'},stdio:['ignore','pipe','pipe']});
 let diagnostics='';child.stdout.on('data',b=>diagnostics+=b.toString());child.stderr.on('data',b=>diagnostics+=b.toString());
 const base='http://127.0.0.1:'+port;
 try{
  for(let attempt=0;attempt<80;attempt++){try{const r=await fetch(base+'/api/auth/session');if(r.status===401)break;}catch{}await new Promise(r=>setTimeout(r,100));if(attempt===79)throw Error('Servidor de teste não iniciou. '+diagnostics.slice(-1000));}
  const app=initializeClient({projectId:'demo-rodovar-conecta',apiKey:'emulator-only',authDomain:'demo-rodovar-conecta.firebaseapp.com'},'portal-bridge-client');
  try{const clientAuth=getAuth(app);connectAuthEmulator(clientAuth,'http://127.0.0.1:9099',{disableWarnings:true});const credential=await signInWithEmailAndPassword(clientAuth,email,password);const token=await credential.user.getIdToken();
   assert.equal((await fetch(base+'/api/auth/firebase-test',{method:'POST',headers:{Authorization:'Bearer invalid','Content-Type':'application/json'},body:'{}'})).status,401);
   const login=await fetch(base+'/api/auth/firebase-test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({rememberMe:false})});const loginBody=await login.text();assert.equal(login.status,200,loginBody);const payload=JSON.parse(loginBody);assert.equal(payload.user.id,uid);assert.equal(payload.user.accessProfile,'MONITORAMENTO');assert.ok(payload.sessionId&&payload.csrfToken);
   const restored=await fetch(base+'/api/auth/session',{headers:{'X-Rodovar-Session':payload.sessionId}});assert.equal(restored.status,200);const session=await restored.json();assert.equal(session.user.id,uid);assert.equal(session.user.accessLevel,'FUNCIONARIO');
   assert.equal((await fetch(base+'/api/admin/access-requests',{headers:{'X-Rodovar-Session':payload.sessionId}})).status,403);
  }finally{await deleteApp(app);}
 }finally{child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',()=>resolve());setTimeout(resolve,2000);});await rm(root,{recursive:true,force:true});await auth.deleteUser(uid).catch(()=>{});await db.collection('portalUsers').doc(uid).delete();}
});
