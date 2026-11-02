# Homologação: interface de login remoto

A compilação na Vercel ativa o login remoto exclusivamente quando VERCEL_ENV=preview,
RODOVAR_CLOUD_ENV=homologation e GOOGLE_CLOUD_PROJECT=rodovar-conecta-hml-60770.
Somente um booleano público entra no bundle, nunca credenciais OIDC ou chaves administrativas.
Login, restauração, bloqueio e logout reutilizam a interface existente; os tokens locais e remotos
usam chaves de armazenamento distintas. Primeiro acesso usa /api/cloud/profile, valida sessão
recente e CSRF, altera a senha no Firebase e invalida sessões anteriores.

## Primeiro administrador (execução manual única)

Não existe endpoint de bootstrap, cadastro público ou criação automática de usuários.
Um operador deve criar explicitamente no Authentication de homologação uma identidade de teste
ativa com e-mail @example.test e senha inicial individual, sem dados reais. Anote somente o UID.
Em terminal com ADC autorizado para homologação, configure RODOVAR_CLOUD_ENV=homologation e
GOOGLE_CLOUD_PROJECT=rodovar-conecta-hml-60770 e execute:

```
node --import tsx scripts/bootstrap-cloud-admin.ts UID admin.hml "Administrador de Teste" PROVISION:rodovar-conecta-hml-60770:UID
```

Não passe senha/chave privada na linha de comando. A autorização do Firebase CLI não equivale
a ADC. O comando recusa outro projeto, conta real, identidade já vinculada ou política de
segurança já existente. Uma transação cria perfil, vínculos privados, política de administrador
protegido e auditoria; tentativas concorrentes não criam dois administradores.
Não foi executado remotamente: nenhuma identidade de teste foi escolhida/criada pelo usuário.

## Limites desta entrega

As telas operacionais ainda chamam a API local. Comercial, Expedição e Monitoramento NÃO estão
migrados. O repositório transacional de fretes não substitui o motor operacional em arquivos.
Chat tem leitura paginada e escrita autenticadas em /api/cloud/chat; sua interface ainda não
foi ligada ao adaptador. As leituras novas passam pelo servidor e permitem manter as regras
do Firestore fechadas. Elas precisam do índice messages(conversationId, sequence desc), já
descrito em firestore.cloud.indexes.json, antes do uso remoto do chat.

Não houve mudança nas regras remotas, produção, faturamento ou dados corporativos.
Os testes usam somente os emuladores demo-rodovar-conecta. Um login válido não comprova a
migração dos módulos, e a Preview continua sendo uma entrega parcial de homologação.
