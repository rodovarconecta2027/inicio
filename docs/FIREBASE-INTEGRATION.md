# Firebase: preparação isolada e sem publicação

## Estrutura encontrada
- Interface React/Vite: App.tsx, LoginScreen.tsx e serverApi.ts; preservada.
- Autenticação operacional existente: Express, scrypt, cookie/sessão, CSRF e allowlist em server.ts.
- Persistência atual: arquivos JSON, anexos privados e históricos em src/server/*.ts.
- Firebase legado: a configuração antiga foi retirada do bundle e os metadados/regras antigos permanecem apenas locais e ignorados pelo Git/Vercel. Os exports legados usam um projeto demo inválido e não são autoridade de autenticação.

## Etapas implementadas
1. Projeto fictício demo-rodovar-conecta em Auth e Firestore Emulator, com app Firebase nomeado separado.
2. Login cliente real por e-mail/senha (Firebase SDK), sessão de navegador e token enviado ao backend. Não existe rota de cadastro nesse adaptador. Uma conta criada diretamente no Auth fica sem acesso ao portal se não tiver perfil aprovado provisionado pelo servidor; restrições de criação no provedor devem ser configuradas antes da homologação remota.
3. Backend valida token pelo Admin SDK e recarrega o perfil do Firestore a cada operação. Reutiliza hasPagePermission. Perfis não são editáveis pelo cliente. Nenhum administrador é inferido de um endereço de e-mail.
4. Firestore persiste solicitações, responsáveis, notificações e auditoria via transações. Chave de idempotência evita duplicações e claim transacional evita dois responsáveis.
5. Regras independentes em firestore.test.rules bloqueiam escritas diretas, isolam solicitações, perfis, finanças e documentos confidenciais. As regras são próprias do ambiente fictício; o UID test-master jamais deve ser usado em produção.
6. Testes reais nos emuladores verificam login inválido, token inválido, perfil inativo, autorização, isolamento, concorrência, reenvio, escrita de privilégios/pagamentos bloqueada e leitura após recriar a API.
7. A tela de login existente pode usar o Auth Emulator somente com a flag local explícita. A ponte POST /api/auth/firebase-test valida o ID token e o perfil Firestore, resolve employeeId e emite a mesma sessão/CSRF já consumida pelos módulos. O cadastro local continua sendo a autoridade de permissões durante a migração.

## Executar
Pré-requisitos: npm ci, Node 22+, Java 21 no PATH ou JAVA_HOME. Nesta máquina o runtime portátil está em tools/java21 e é detectado automaticamente; ele não é versionado.

- npm run firebase:test: inicia os emuladores, executa testes com contas fictícias e encerra.
- npm run firebase:emulators: mantém Auth 9099 e Firestore 8080 em 127.0.0.1.
- npm run firebase:api: inicia API independente de integração na porta 3101. Execute com os emuladores ativos. Não inicializa o portal nem migra dados.
- npm run firebase:portal: inicia Auth + Firestore Emulator e o portal de homologação em http://127.0.0.1:3100. O comando falha em produção/Vercel e não cria contas.
- src/firebase-test/client.ts: adaptador ligado condicionalmente à tela existente somente em localhost/127.0.0.1 com VITE_RODOVAR_AUTH_PROVIDER=firebase-emulator. Sem a flag, o login operacional permanece inalterado.

Os testes criam somente contas example.test no emulador, com senhas aleatórias descartáveis. Não importam contas reais, senhas, documentos ou dados de data/. A suíte testa persistência durante a vida do emulador e entre instâncias da API; não testa retenção após encerrar o emulador.

## Limites e próximas etapas obrigatórias
Esta entrega prepara a integração, sem substituir o portal atual. Somente o fluxo de solicitações abrir/listar/assumir tem adaptador transacional exercitado; respostas, anexos e conclusão continuam na implementação operacional existente.

O login de homologação já pode ser exercitado sem trocar a autoridade de permissões: Firebase autentica, Firestore valida o vínculo e o servidor atual emite a sessão compatível. Antes de ativar isso em ambiente remoto, migrar por módulo as APIs de usuários/senhas, fretes, notificações, mural/enquetes, agenda, financeiro e RH, mantendo suas regras atuais. Os clientes existentes ainda chamam as APIs JSON; a ativação remota continua bloqueada até essa migração.

Usuários por nome de login precisam de resolução privada para um UID/e-mail autorizado; o adaptador Firebase atual aceita e-mail/senha. Não foi criado índice público de logins. A política de senha e troca obrigatória, gestão de sessões, auditoria geral e uploads privados precisam ser integrados ao provedor antes da substituição do login.

Escolher um projeto Firebase exclusivo de homologação e seu UID administrador por processo administrativo confiável. Configurar ADC/workload identity para o servidor, sem chaves no código. Criar regras de produção revisadas e testadas, sem copiar o UID fictício. Firestore Admin ignora Security Rules; por isso os serviços sempre precisam validar as permissões.

Os fretes e arquivos JSON não foram migrados. Arquivos e comprovantes exigem armazenamento privado apropriado e autorização equivalente; Firestore não substitui binários. A publicação Vercel continua bloqueada pela ausência de adaptação integral das APIs/persistência; não publicar somente dist como se o sistema completo estivesse pronto.

## GitHub / Vercel
Nada foi enviado, vinculado a projeto Firebase real ou publicado nesta etapa. Workflow Firebase separado usa demo-project + Java 21 e não contém deploy ou segredos. Variáveis de testes não devem ser adicionadas a Vercel Production. tools/, data/ e caches do emulador permanecem fora de Git/deploy.

Referências: https://firebase.google.com/docs/auth/admin/verify-id-tokens e https://firebase.google.com/docs/emulator-suite/connect_firestore

## Resultado da validação desta etapa
- npm run firebase:test: 3 testes aprovados com Auth e Firestore Emulator, usando SDKs oficiais. Além das regras e transações, a suíte inicia uma cópia temporária do servidor, troca um token fictício por sessão real, restaura a sessão e confirma o bloqueio administrativo. As mensagens PERMISSION_DENIED registradas correspondem às tentativas intencionalmente recusadas.
- npm run lint: aprovado.
- Regressões de acesso, frete único, RH, início e identificadores de envio: 8 testes aprovados.
- npm run build: aprovado; avisos já existentes de bundle grande e __dirname.
- Verificado que runtime Java, bancos locais, logs e metadados Vercel ficam ignorados pelo Git.
- Verificado que a configuração do projeto Firebase antigo não entra no bundle nem no conjunto versionável.
- Nenhum push, deploy, importação de usuários reais ou alteração de regras/projeto Firebase remoto foi executado.
- npm audit reporta 28 ocorrências (24 moderadas e 4 altas), incluindo dependências do SDK Firebase já usado pelo portal. Não foi aplicado downgrade/atualização incompatível automaticamente. Revisar esse resultado antes de homologação remota.

## Arquivos desta etapa
- src/firebase-test/client.ts
- src/server/firebase-test/runtime.ts e api.ts
- src/server/firebase-test/portalIdentity.ts e a rota condicional /api/auth/firebase-test
- firebase.test.json, firestore.test.rules, firebase-test.env.example
- scripts/firebase-emulators.mjs, start-firebase-test.mts, start-firebase-portal.mjs e firebase-integration.test.ts
- .github/workflows/firebase-test.yml
- package.json/package-lock.json e exclusões em .gitignore/.vercelignore

Nenhuma mudança visual foi introduzida. O adaptador entra no bundle, mas permanece inativo e sem conexão quando a flag local não existe; Vercel e o servidor normal continuam no fluxo operacional atual.
