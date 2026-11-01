// Start the independent integration API. Does not start or mutate the existing portal.
process.env.RODOVAR_FIREBASE_ENV='emulator';process.env.GCLOUD_PROJECT='demo-rodovar-conecta';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {createFirebaseTestApi}=await import('../src/server/firebase-test/api');
createFirebaseTestApi().listen(3101,'127.0.0.1',()=>console.log('Firebase integration test API: http://127.0.0.1:3101'));
