# Autenticação corporativa — etapa do backend

Implementação: `src/server/cloud/authService.ts`, `authRoutes.ts`, `identity.ts` e registro em `api.ts`. As rotas de migração são `/api/cloud/auth/login`, `/session`, `/logout` e `/lock-status`. O endpoint de cadastro público é bloqueado. A interface ainda não foi redirecionada para essas rotas.

A senha é validada pela API oficial do Firebase Authentication. A associação privada entre login e UID fica em `auth_identifiers`, com chave SHA-256 do identificador normalizado; cada vínculo contém o UID e o e-mail Firebase autorizado. Não há consulta pública desse índice, criação automática de contas nem promoção administrativa por e-mail.

As tentativas são contadas em transações do Firestore. Login e e-mail vinculados ao mesmo UID compartilham o limite de cinco tentativas em dois minutos. O contador independe do navegador. Indisponibilidade do provedor é tratada como falha do serviço, com compensação da tentativa reservada.

As sessões usam identificadores aleatórios, armazenados somente por hash em `auth_sessions`, com expiração, vínculo ao usuário, token CSRF e horário da autenticação Firebase. O navegador recebe cookie HttpOnly e o contrato de sessão já usado pelo portal. A restauração recarrega o estado do usuário e a identidade Firebase para bloquear suspensão e revogação. A sessão apresentada durante uma suspensão é removida e não volta a funcionar após reativação. O fluxo administrativo futuro deve revogar todas as sessões/tokens ao suspender a conta.

A API impede operações de comunicação quando o cadastro exige troca de senha. A integração do fluxo de primeiro acesso, alteração de senha e recuperação administrativa permanece pendente; esse bloqueio não deve ser removido para liberar a tela.

O parâmetro `FIREBASE_WEB_API_KEY` foi configurado de forma protegida somente na prévia da branch de homologação. Ele corresponde à configuração do SDK Firebase, não a uma credencial administrativa. Nenhum valor foi colocado no código ou neste documento. A identidade administrativa continua sendo OIDC, sem chave privada.

Testes executados no Auth/Firestore Emulator: login com usuário corporativo, cookie HttpOnly, persistência de sessão entre instâncias da API, saída com validação CSRF, cadastro público negado, suspensão e reativação, seis tentativas concorrentes com exatamente uma barrada pelo limite e compartilhamento do bloqueio entre login e e-mail. Todos aprovados. Não foram criadas contas reais ou fictícias no projeto remoto nesta etapa.

Pendências para ativar as telas: completar primeiro acesso e recuperação administrativa; integrar o contrato de login/saída/restauração no frontend sem reativar o Firebase legado; concluir APIs operacionais para que um login válido não leve a módulos incompletos; provisionar somente fixtures explicitamente identificadas como testes; validar o fluxo pela interface na Vercel.
