import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
export const TEST_PROJECT='demo-rodovar-conecta';
export function assertEmulatorEnvironment(env:NodeJS.ProcessEnv=process.env){
 if(env.RODOVAR_FIREBASE_ENV!=='emulator'||env.GCLOUD_PROJECT!==TEST_PROJECT||env.NODE_ENV==='production')throw Error('Integração de testes bloqueada: ambiente emulador explícito obrigatório.');
 if(env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Os emuladores devem usar apenas os endereços locais previstos.');
 if(env.VERCEL||env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('Credenciais de produção ou Vercel não são permitidas neste ambiente de testes.');
}
export function firebaseTestRuntime(){assertEmulatorEnvironment();const app=getApps().find(a=>a.name===TEST_PROJECT)||initializeApp({projectId:TEST_PROJECT},TEST_PROJECT);return {auth:getAuth(app),db:getFirestore(app)};}
