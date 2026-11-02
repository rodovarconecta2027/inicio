# Plano progressivo — Firebase, Firestore e Vercel

## Arquitetura encontrada

Frontend React 19/Vite, TypeScript e Express 4. O servidor operacional mantém sessões, CSRF, limite de tentativas e perfis em `server.ts`. A persistência utiliza arquivos JSON e anexos privados. Publicar apenas `dist/` não publica a API. O Firebase legado em `src/lib/firebase.ts` está desativado e inclui caminhos antigos de provisionamento; não deve ser reativado.

Checkpoint: `restore-points/cloud-api-2026-11-02/`, local e ignorado pelo Git. Nenhum banco, sessão ou binário foi incluído no código versionável.

| Área | Implementação existente | Destino e cuidados |
| --- | --- | --- |
| Login, contas e permissões | `server.ts`, `accountLifecycle.ts`, `accessPolicy.ts`, `permissions.ts` | Authentication + `users`, `employee_profiles`, `permissions`, índice privado de login e sessões com revogação. Preservar UID e administrador; não provisionar contas automaticamente. |
| Chat e grupos | `App.tsx`, `WhatsAppChatView.tsx`, estado do navegador | `conversations`, `conversation_members`, `messages`, `groups`, `group_members`, `message_reads`, `chat_preferences`. Adaptador novo isolado; ativação da interface depende da migração de identidade. |
| Fretes | `unifiedFreightEngine.ts`, `expeditionValidation.ts` | `freight_operations`, `freight_tracking`, `freight_documents`, contador RDV e idempotência transacionais. Reutilizar validações operacionais. |
| Financeiro | `paymentReceiptsEngine.ts`, `unifiedFreightEngine.ts` | `financial_records`, comprovantes privados e confirmação exclusiva do Financeiro. A modalidade não confirma pagamento. |
| RH interno | `requestQueue.ts` | `hr_requests`, fila compartilhada, SLA original, atribuição transacional, respostas e anexos privados. |
| RH externo | `externalRh.ts` | Registros confidenciais em coleções próprias; boletos bloqueados até provedor bancário e webhook validados. |
| Mural e enquetes | `mural.ts` | `announcements`, `polls`, `poll_votes`, comentários, curtidas e registros de ciência preservados. |
| Agenda | `agenda.ts` | Coleções de eventos e participações, convites, histórico e notificações direcionadas. |
| Motoristas e capas | `drivers.ts`, `customerCovers.ts` | Cadastros com acesso conforme perfil; imagens no Storage privado, sem duplicar pessoas/clientes. |
| Administração/configuração | `server.ts` | `departments`, `permissions`, `system_settings`, `audit_logs`; operações críticas auditadas e administrador protegido. |
| Notificações | Serviços operacionais e estado da interface | `notifications`, destinatário por UID, links diretos, ordem cronológica e deduplicação. |
| Arquivos | Diretórios privados e rotas autorizadas | Firebase Storage, metadados no Firestore. Storage exige Blaze; não ativar cobrança sem autorização. |

## Sequência

1. Provisionar homologação isolada, fechar regras remotas e impedir cadastro público no provedor. Concluído.
2. Extrair aplicação Express, testar sessão e manter compatibilidade local/LAN. Concluído.
3. Implementar serviços de chat e regras candidatas, com testes reais no Emulator Suite. Adaptador e testes implementados; interface ainda local.
4. Implementar identidade corporativa completa e repositórios por módulo, preservando contratos das APIs. Pendente.
5. Identidade restrita do servidor autorizada e criada com OIDC, sem chave privada. Restrita ao projeto e ambiente preview da Vercel. Storage permanece pendente: o usuário decidiu manter o Spark. Integração das telas ao novo provedor ainda pendente.
6. Publicar somente prévia e executar os fluxos completos. Pendente. Publicação em produção exige autorização final.

## Limites e estimativa de uso

Firestore Standard tem cotas gratuitas de 1 GiB armazenado, 50 mil leituras/dia e 20 mil escritas/dia; limites e preços devem ser revistos antes de ativar faturamento. Fontes: https://firebase.google.com/docs/firestore/quotas e https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024

O adaptador de chat limita a 50 vínculos e 40 mensagens por página, usa listener somente na conversa aberta e devolve funções de cancelamento. Uma mensagem nova exige duas escritas transacionais (mensagem + resumo); confirmação de leitura exige duas (vínculo + registro). Uma atualização da conversa aberta implica leitura por cliente inscrito. Exemplo de dimensionamento, não medição: 16 usuários enviando 50 mensagens/dia geram 800 mensagens e pelo menos 1.600 escritas, além de leituras, confirmações e auditorias. Grupos aumentam leituras conforme participantes conectados. Não há promessa de custo zero.

Presença e digitação não foram simuladas. Arquivos não são armazenados em campos base64 no Firestore. O Storage não foi ativado. A identidade `rodovar-api-hml` tem `roles/datastore.user` e `roles/firebaseauth.admin` apenas no projeto de homologação. A federação exige os IDs imutáveis da equipe e do projeto Vercel e `environment=preview`; produção e outros projetos não são aceitos.

## Variáveis e publicação

`RODOVAR_CLOUD_ENV=homologation` e `GOOGLE_CLOUD_PROJECT=rodovar-conecta-hml-60770` identificam o ambiente do servidor. Não são segredos. Credenciais administrativas devem vir de identidade de serviço/ADC no servidor, nunca do bundle ou da conta pessoal do Firebase CLI. O adaptador remoto rejeita projeto de produção e hosts de emuladores.

O endpoint preparado `api/cloud.ts` atende apenas a superfície de migração `/api/cloud/*`; não substitui `/api/auth/*` e os módulos operacionais. O rewrite atende exclusivamente essa superfície. O diagnóstico `/api/cloud/health` testa uma leitura real do Firestore e informa explicitamente que a migração é parcial. Definir variáveis ou criar coleções não torna o portal completo funcional.

O adaptador `FirestoreFreightStore` foi testado no emulador para sequência RDV, reenvio, revisão e identidade imutável. Ele ainda não substitui o motor operacional; autorização e validações existentes devem ser reutilizadas antes de integrá-lo às rotas.

Antes da prévia: completar as APIs, identidade, regras por módulo, índices e uploads; executar `npm run lint`, `npm run build`, `npm run firebase:test`, `npm run cloud:test` e regressões; cadastrar no Firebase apenas fixtures fictícias aprovadas para homologação; configurar a identidade de serviço restrita e os domínios; publicar uma branch de prévia; testar dois navegadores e F5. Só depois solicitar publicação em produção.
