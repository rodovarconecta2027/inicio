import {initializeApp,getApps} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut,browserSessionPersistence,browserLocalPersistence,setPersistence} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
const projectId='demo-rodovar-conecta';
// Separate named app. It is used by the portal only when the explicit local
// VITE_RODOVAR_AUTH_PROVIDER=firebase-emulator flag is enabled.
export function isFirebaseEmulatorPortalEnabled(){
 return import.meta.env.DEV&&import.meta.env.VITE_RODOVAR_AUTH_PROVIDER==='firebase-emulator'&&typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname);
}
export function firebaseTestClient(){
 if(!isFirebaseEmulatorPortalEnabled())throw Error('Cliente Firebase de testes disponível somente no desenvolvimento local autorizado.');
 const existing=getApps().find(a=>a.name===projectId);const app=existing||initializeApp({projectId,apiKey:'emulator-only',authDomain:projectId+'.firebaseapp.com'},projectId);
 const auth=getAuth(app),db=getFirestore(app);
 if(!existing){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);}
 return {auth,db};
}
export async function signInFirebaseTest(email:string,password:string,rememberMe=false){
 const {auth}=firebaseTestClient();await setPersistence(auth,rememberMe?browserLocalPersistence:browserSessionPersistence);
 const credential=await signInWithEmailAndPassword(auth,email,password);
 const token=await credential.user.getIdToken();
 const response=await fetch('/api/auth/firebase-test',{method:'POST',credentials:'include',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({rememberMe})});
 if(!response.ok){const detail=await response.json().catch(()=>({}));await signOut(auth);throw Error(detail.error||'Conta sem perfil ativo e aprovado para o portal.');}
 return response.json();
}
export async function signOutFirebaseTest(){await signOut(firebaseTestClient().auth);}
