import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';
if(process.env.NODE_ENV==='production'||process.env.VERCEL)throw Error('Emuladores de teste não podem executar na produção ou Vercel.');
const environment={...process.env,RODOVAR_FIREBASE_ENV:'emulator',GCLOUD_PROJECT:'demo-rodovar-conecta',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};
if(process.platform==='win32'&&!environment.JAVA_HOME&&fs.existsSync('tools/java21')){const folder=fs.readdirSync('tools/java21',{withFileTypes:true}).find(d=>d.isDirectory());if(folder)environment.JAVA_HOME=path.resolve('tools/java21',folder.name);}
const pathKey=Object.keys(environment).find(key=>key.toUpperCase()==='PATH')||'PATH';
environment[pathKey]=[...(environment.JAVA_HOME?[path.join(environment.JAVA_HOME,'bin')]:[]),path.dirname(process.execPath),environment[pathKey]||''].join(path.delimiter);
const mode=process.argv[2]||'test',args=['node_modules/firebase-tools/lib/bin/firebase.js',mode==='test'?'emulators:exec':'emulators:start','--config','firebase.test.json','--project','demo-rodovar-conecta','--only','auth,firestore'];
if(mode==='test')args.push('node --import tsx --test scripts/firebase-integration.test.ts');
const result=spawnSync(process.execPath,args,{env:environment,stdio:'inherit'});if(result.error){console.error('Não foi possível iniciar os emuladores. Confira Java 21 e dependências.');process.exit(1);}process.exit(result.status??1);
