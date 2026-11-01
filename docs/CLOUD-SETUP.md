# Rodovar Conecta - cloud setup

Target: private GitHub repository rodovarconecta2027/rodovar-conecta and Vercel. Firebase provisioning/deployment is outside the current authorized scope.

## Prepared
- Git ignores runtime databases, accounts, private documents, sessions, environment files, restore points and generated builds.
- GitHub CI runs type checking, data-independent tests and build on pushes to main and pull requests.
- Local server behavior is unchanged.

## Required before production
1. Create/authorize the private repository rodovarconecta2027/rodovar-conecta. Current browser account is different; do not upload the source to the public repository hipecreator20/rodovarconecta2027.
2. Review source for secrets and seed credentials before first push. Never upload data/ or private documents.
3. Adapt JSON persistence, sessions and private attachments to durable storage compatible with the selected Vercel architecture. Current Vercel config publishes the web UI only and does not serve Express APIs.
4. Connect the existing Vercel project to the reviewed repository. Keep production gated by successful checks; previews must use isolated test data.
5. Test login, API access, file upload/download, Expedição -> Monitoramento, financial restrictions and reload persistence on a preview before production.
6. Do not provision or configure Firebase for the current scope.

Code updates become automatic after reviewed commits are pushed. Business records are runtime data and must persist independently of deployments.

## Current status
Vercel project rodovar-conecta created (prj_ikZPgKrXM0XUeUOvexGs4q32MC4K), locally linked with ignored metadata. No code deployment or data migration performed. GitHub account rodovarconecta2027 is connected, but the intended repository returns 404 and no owned repository is accessible. Browser is signed into a different account. The private target repository and runtime persistence adaptation remain required. Firebase is excluded from this request.
