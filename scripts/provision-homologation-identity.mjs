// Explicitly authorized staging IAM provisioning. No service-account keys.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { ensure } = require('firebase-tools/lib/ensureApiEnabled');
const { Client } = require('firebase-tools/lib/apiv2');
const project = 'rodovar-conecta-hml-60770', number = '1016922703090';
const poolId = 'rodovar-vercel-hml', providerId = 'vercel-preview';
const accountId = 'rodovar-api-hml', email = `${accountId}@${project}.iam.gserviceaccount.com`;
const team = 'mhrsuporteti-5479', vercelProjectId = 'prj_ikZPgKrXM0XUeUOvexGs4q32MC4K';
if (process.argv[2] !== project || process.env.VERCEL) throw Error('Provisionamento restrito à homologação explicitamente autorizada.');
await requireAuth({ project, ...getGlobalDefaultAccount() });
for (const api of ['iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com']) {
  await ensure(project, api, 'rodovar', true);
  console.log(`API habilitada: ${api}`);
}
const iam = new Client({ urlPrefix: 'https://iam.googleapis.com', apiVersion: 'v1' });
const resources = new Client({ urlPrefix: 'https://cloudresourcemanager.googleapis.com', apiVersion: 'v1' });
const options = { skipLog: { body: true, resBody: true } };
async function existing(client, name) {
  try { return (await client.get(name, { ...options })).body; }
  catch (error) { if (error.status === 404 || error.context?.response?.statusCode === 404 || error.message?.includes('HTTP Error: 404')) return null; throw error; }
}
async function completed(operation) {
  for (let i = 0; i < 30 && !operation.done; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    operation = (await iam.get('/' + operation.name, { ...options })).body;
  }
  if (!operation.done || operation.error) throw Error('A operação IAM não foi concluída: ' + (operation.error?.message || operation.name));
}
const parent = `/projects/${number}/locations/global/workloadIdentityPools`;
const pool = `${parent}/${poolId}`;
if (!(await existing(iam, pool))) {
  await completed((await iam.post(parent, { displayName: 'Rodovar Vercel Homologacao', description: 'Somente previews do projeto Rodovar autorizado.' },
    { ...options, queryParams: { workloadIdentityPoolId: poolId } })).body);
}
const provider = `${pool}/providers/${providerId}`;
const condition = `assertion.owner_id == 'team_5xG6jBTCfWVXdl1NshYbJd9d' && assertion.project_id == '${vercelProjectId}' && assertion.environment == 'preview'`;
const foundProvider = await existing(iam, provider);
if (!foundProvider) {
  await completed((await iam.post(`${pool}/providers`, {
    displayName: 'Vercel Preview', attributeMapping: { 'google.subject': 'assertion.sub' },
    attributeCondition: condition, oidc: { issuerUri: `https://oidc.vercel.com/${team}`, allowedAudiences: [`https://vercel.com/${team}`] },
  }, { ...options, queryParams: { workloadIdentityPoolProviderId: providerId } })).body);
} else if (foundProvider.attributeCondition !== condition || foundProvider.oidc?.issuerUri !== `https://oidc.vercel.com/${team}`) {
  throw Error('O provedor existente possui outra política. Revisão manual obrigatória; nenhuma ampliação foi aplicada.');
}
const account = `/projects/${project}/serviceAccounts/${email}`;
if (!(await existing(iam, account))) await iam.post(`/projects/${project}/serviceAccounts`, {
  accountId, serviceAccount: { displayName: 'Rodovar API Homologacao', description: 'Firestore e Authentication exclusivamente em homologacao.' },
}, { ...options });

const projectPolicy = (await resources.post(`/projects/${project}:getIamPolicy`, {}, { ...options })).body;
projectPolicy.bindings ||= [];
for (const role of ['roles/datastore.user', 'roles/firebaseauth.admin']) {
  let binding = projectPolicy.bindings.find(b => b.role === role && !b.condition);
  if (!binding) { binding = { role, members: [] }; projectPolicy.bindings.push(binding); }
  if (!binding.members.includes('serviceAccount:' + email)) binding.members.push('serviceAccount:' + email);
}
await resources.post(`/projects/${project}:setIamPolicy`, { policy: projectPolicy }, { ...options });

const policy = (await iam.post(account + ':getIamPolicy', {}, { ...options })).body;
policy.bindings ||= [];
const subject = `principal://iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/${poolId}/subject/owner:${team}:project:rodovar-conecta:environment:preview`;
let binding = policy.bindings.find(b => b.role === 'roles/iam.workloadIdentityUser' && !b.condition);
if (!binding) { binding = { role: 'roles/iam.workloadIdentityUser', members: [] }; policy.bindings.push(binding); }
if (!binding.members.includes(subject)) binding.members.push(subject);
await iam.post(account + ':setIamPolicy', { policy }, { ...options });
console.log('Identidade criada e vinculada exclusivamente ao preview Rodovar. Nenhuma chave privada foi criada.');
console.log(JSON.stringify({ project, number, serviceAccount: email, poolId, providerId }));
