# Rodovar Conecta — homologação remota

## Recursos provisionados em 02/11/2026

- Firebase: `rodovar-conecta-hml-60770`, projeto separado de produção, plano Spark.
- Aplicativo web: `1:1016922703090:web:08f4ace4a538400860bc6b`.
- Firestore `(default)`: `southamerica-east1`, Standard, camada gratuita e proteção contra exclusão.
- Authentication: provedor e-mail/senha; nenhuma conta corporativa foi importada.
- Cadastro e exclusão de conta pelo cliente bloqueados na configuração do provedor.
- Escrita/leitura administrativa remota confirmada com um registro técnico sem dados pessoais.
- Identidade de serviço e federação OIDC restritas à prévia Vercel, autorizadas pelo usuário. Sem chave privada. Storage continua desativado por escolha do usuário (Spark).
- As regras remotas começam bloqueando todo acesso direto. Não usar as regras do emulador no projeto remoto.

## Backend

`createPortalApp({ serveFrontend: false })` monta a API Express existente sem abrir uma porta ou iniciar Vite. `startServer()` mantém a execução local/LAN. Importar o servidor não inicializa dados nem abre listener.

`GET /api/health` informa explicitamente o mecanismo atual de autenticação e persistência. Não é uma comprovação de integração Firebase. A execução do backend de arquivos na Vercel é bloqueada para impedir uso de disco efêmero como armazenamento definitivo.

O frontend Vite na Vercel ainda não possui a API operacional publicada. Provisionar recursos Firebase não substitui essa migração.

## Trabalho ainda necessário para ativar o portal remoto

1. Vincular identidade Firebase a cada UID corporativo aprovado, preservar o administrador principal e integrar o ciclo de senha/sessão.
2. Migrar as operações de usuários, fretes, pagamentos, notificações, Mural, enquetes, Agenda, solicitações e RH para repositórios duráveis, mantendo idempotência e concorrência.
3. Configurar armazenamento privado para anexos com autorização e compatibilidade com os limites de upload da hospedagem.
4. Configurar identidade de serviço restrita para a API; não usar o login pessoal do CLI como credencial da aplicação.
5. Publicar uma prévia com os serviços configurados e testar login, perfis, anexos, F5 e o fluxo Comercial → Expedição → Monitoramento → Financeiro.

Não copiar bancos locais, senhas, sessões ou documentos para o repositório. A autorização do Firebase CLI permanece na configuração local da ferramenta.

## Comandos

Publicar somente as regras fechadas de homologação:

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js deploy --only firestore:rules --config firebase.homologation.json --project rodovar-conecta-hml-60770
```

O comando acima não publica frontend, usuários nem dados.
