# Relatório de implantação progressiva — 02/11/2026

## Resultado verificado

A infraestrutura de homologação foi conectada: uma função da Vercel em São Paulo leu o Firestore remoto usando OIDC e identidade de serviço, sem chave privada. O portal completo ainda não foi migrado. O diagnóstico declara `migration: partial` deliberadamente.

Prévia validada, commit de código `7e4056611fa97f0a3dda134bc82a410b8c565c51`:

- https://rodovar-conecta-2leqe7aq2-mhrsuporteti-5479.vercel.app/
- https://rodovar-conecta-2leqe7aq2-mhrsuporteti-5479.vercel.app/api/cloud/health
- Branch: https://github.com/rodovarconecta2027/inicio/tree/cloud/firebase-homologation

HTTP observado: página inicial 200; diagnóstico Firestore 200 com `no-store`; sessão cloud sem autenticação 401. A prévia continua protegida pela autenticação da Vercel. Não houve publicação em produção nem alteração da branch main.

## 1. Arquivos criados e modificados

Criados:

- `api/cloud.ts`: função de migração na Vercel.
- `src/server/cloud/runtime.ts`, `api.ts`, `chat.ts`, `chatRoutes.ts`, `freightStore.ts`: identidade OIDC, sessão verificada, serviço de chat e repositório transacional de fretes.
- `src/cloud/chatClient.ts`: consultas limitadas, listener por conversa e paginação.
- `firebase.homologation.json`, `firestore.homologation.rules`, `firestore.homologation.indexes.json`: configuração remota inicialmente fechada.
- `firebase.cloud-test.json`, `firestore.cloud.rules`, `firestore.cloud.indexes.json`: regras candidatas e índices de chat para testes isolados.
- `scripts/api-bootstrap.test.ts`, `scripts/cloud-chat.test.ts`: testes novos.
- `scripts/harden-homologation.mjs`, `scripts/provision-homologation-identity.mjs`: configuração administrativa idempotente restrita ao projeto de testes.
- `docs/CLOUD-HOMOLOGATION.md`, `docs/MIGRATION-MAP.md` e este relatório.

Modificados:

- `server.ts` e `scripts/start-lan.mjs`: extração da aplicação Express sem iniciar listener ao importar; diagnóstico local; bloqueio de armazenamento efêmero na Vercel.
- `src/lib/permissions.ts`: extensão explícita do import para compatibilidade ESM; política de acesso preservada.
- `package.json` e `package-lock.json`: SDKs oficiais, Node 24 e correções compatíveis de dependências.
- `vercel.json`: somente a superfície `/api/cloud/*` e região `gru1`.
- `scripts/firebase-emulators.mjs` e `.github/workflows/firebase-test.yml`: suíte nova, Node 24 e verificação de carregamento do Admin SDK.
- `docs/FIREBASE-INTEGRATION.md`: aviso distinguindo o registro antigo dos emuladores da nova homologação.

Checkpoint local: `restore-points/cloud-api-2026-11-02/`, ignorado pelo Git. Dados, uploads, sessões, credenciais e arquivos locais não foram enviados ao repositório.

## 2. Serviços configurados

- Projeto Firebase separado: `rodovar-conecta-hml-60770`, plano Spark.
- Authentication: e-mail/senha habilitado. Cadastro e exclusão pelo cliente bloqueados no provedor e configuração conferida por leitura da API.
- Firestore Standard `(default)` em `southamerica-east1`, camada gratuita e proteção contra exclusão.
- Registro técnico de verificação de escrita/leitura, sem dados pessoais.
- Conta de serviço `rodovar-api-hml`: Firestore e administração do Authentication somente neste projeto, conforme autorização do usuário.
- Workload Identity Federation: exige os IDs imutáveis da equipe/projeto da Vercel e ambiente `preview`; sujeito limitado a este projeto. Nenhuma chave privada criada.
- Variáveis não secretas `RODOVAR_CLOUD_ENV` e `GOOGLE_CLOUD_PROJECT`: somente na prévia da branch de homologação.
- GitHub conectado à Vercel: pushes desta branch geraram prévias automaticamente.

## 3. Coleções e índices

No projeto remoto, apenas o registro técnico `system_settings/homologation_check` foi gravado. Não houve importação de usuários, fretes, documentos ou dados reais.

Nos emuladores foram exercitadas `users`, `employee_profiles`, `conversations`, `conversation_members`, `messages`, `groups`, `group_members`, `message_reads`, `freight_operations`, `operation_keys`, `system_settings` e `audit_logs`, além das coleções da suíte anterior.

Índices de chat preparados: vínculos por usuário/ativo e mensagens por conversa/sequência. O texto das mensagens foi excluído da indexação automática na configuração candidata. Esses índices ainda não foram publicados no projeto remoto, pois o chat da interface não está ativado nele. `chat_preferences` tem regra preparada, sem implementação de preferências integrada.

## 4. Segurança

- Regras remotas fechadas por padrão, compiladas e publicadas.
- Regras candidatas de chat testadas no emulador: participantes autorizados, perfil ativo/aprovado, isolamento e escritas somente pelo servidor.
- A API valida o token pelo Admin SDK com checagem de revogação, recarrega o cadastro e não promove administrador por endereço de e-mail.
- O serviço recarrega aprovação, permissões e vínculo dentro das transações.
- O repositório RDV exige sequência previamente provisionada; não reinicia contador ausente. Usa revisão, idempotência e identificação imutável.
- Não há gravação de senhas em texto simples, tokens ou credenciais administrativas no repositório.
- As correções de gRPC/Zod removeram os avisos altos da auditoria. Auditoria final das dependências de produção: 4 moderados, 0 altos e 0 críticos. O conjunto completo, incluindo ferramentas de desenvolvimento, tem 24 moderados. A revisão desses avisos continua pendente.

## 5. Validações executadas

- TypeScript (`npm run lint`): aprovado.
- Build Vite: aprovado; avisos de bundle grande e `__dirname` já existentes.
- Regressões locais: 15 testes aprovados, incluindo permissões, administrador protegido, revogação de sessão, fila RH, anexos, atribuição, Agenda, modalidades financeiras, enquetes e verificações da Expedição.
- Integração Firebase original: 3 testes aprovados com Auth/Firestore Emulator, senha, token, perfis, isolamento, concorrência e ponte para a sessão existente.
- Nova suíte cloud: 2 testes aprovados, com dois clientes SDK, listener real, mensagens persistidas, reenvio, edição/remoção, leitura, revogação e repositório RDV transacional.
- Carregamento do Firebase Admin sem `require(ESM)`: aprovado; corrigida incompatibilidade observada na função da Vercel sem desabilitar validação de tokens.
- Vercel → OIDC → identidade Google → Firestore: HTTP 200 na prévia.
- Sessão remota sem token: HTTP 401. Página inicial da prévia: HTTP 200.

Os dois clientes SDK não equivalem a uma validação do chat em dois navegadores pela interface. F5 com todos os módulos remotos, uploads remotos e fluxos operacionais completos na Vercel ainda não foram validados.

## 6. Pendências funcionais

1. Integrar login corporativo por usuário/senha, índice privado de identificadores, limite de tentativas, sessões e recuperação administrativa à nova API. O provedor Firebase está configurado; o login do portal ainda usa a API local existente.
2. Ligar o chat/grupos da interface ao novo adaptador, preservando todos os recursos atuais; implementar as preferências, gestão de participantes e anexos no novo caminho.
3. Conectar os repositórios de todos os módulos às APIs operacionais, reutilizando validações existentes. O repositório RDV novo ainda não substitui o motor de fretes.
4. Migrar Mural, enquetes, Agenda, RH, Financeiro, notificações e Administração; preservar históricos e perfis.
5. Completar regras e testes de todos os módulos, índices e ensaios de falha de rede; não reativar os caminhos legados de provisionamento automático.
6. Executar o roteiro completo na interface da prévia com fixtures fictícias autorizadas, dois navegadores, F5, acesso direto e revisão de permissões.

Nenhuma conta corporativa foi declarada pronta na Vercel.

## 7. Recursos pagos

O usuário decidiu manter Spark. Firebase Storage não foi ativado. Upload/download de arquivos no novo caminho remoto e suas regras permanecem pendentes. Cloud Functions e faturamento também não foram ativados.

O requisito atual do Storage é Blaze; isso não autoriza cobrança. Fontes oficiais: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 e https://firebase.google.com/docs/firestore/quotas . O mapa de migração contém uma estimativa de leituras/escritas, identificada como exemplo, sem promessa de custo zero.

## 8. Publicação

Continuar na branch de homologação. Concluir as pendências funcionais, validar a interface e as regras, resolver a estratégia de arquivos e provisionar somente fixtures de testes. Revisar o diff e os resultados. Solicitar autorização final antes de publicar produção, alterar projeto de produção ou migrar dados reais. A infraestrutura de homologação já validada não deve ser anunciada como portal completo em produção.
