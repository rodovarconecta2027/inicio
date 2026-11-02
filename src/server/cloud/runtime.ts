import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth, IdentityPoolClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

export const HOMOLOGATION_PROJECT = 'rodovar-conecta-hml-60770';

export function cloudRuntime(env: NodeJS.ProcessEnv = process.env) {
  if (env.RODOVAR_CLOUD_ENV !== 'homologation' || env.GOOGLE_CLOUD_PROJECT !== HOMOLOGATION_PROJECT) {
    throw new Error('Configure explicitamente o projeto de homologação autorizado.');
  }
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('A API remota não pode usar os emuladores.');
  }
  if (env.VERCEL && env.VERCEL_ENV !== 'preview') throw new Error('A identidade desta etapa permite somente prévias.');
  // Credentials come from the trusted server environment/ADC. Never load the
  // personal Firebase CLI account or bundle a service-account key.
  const name = 'rodovar-cloud-homologation';
  if (env.VERCEL) {
    const client = new IdentityPoolClient({
      audience: '//iam.googleapis.com/projects/1016922703090/locations/global/workloadIdentityPools/rodovar-vercel-hml/providers/vercel-preview',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/rodovar-api-hml@rodovar-conecta-hml-60770.iam.gserviceaccount.com:generateAccessToken',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    });
    const app = getApps().find(app => app.name === name) || initializeApp({ projectId: HOMOLOGATION_PROJECT, credential: {
      async getAccessToken() {
        const result = await client.getAccessToken();
        if (!result.token) throw new Error('A identidade da API não foi autorizada.');
        return { access_token: result.token, expires_in: Math.max(1, Math.floor(((client.credentials.expiry_date || Date.now() + 300000) - Date.now()) / 1000)) };
      },
    } }, name);
    return { auth: getAuth(app), db: new Firestore({ projectId: HOMOLOGATION_PROJECT, auth: new GoogleAuth({ authClient: client }), preferRest: true }) };
  }
  const app: App = getApps().find(app => app.name === name) || initializeApp({ projectId: HOMOLOGATION_PROJECT, credential: applicationDefault() }, name);
  return { auth: getAuth(app), db: getFirestore(app) };
}
