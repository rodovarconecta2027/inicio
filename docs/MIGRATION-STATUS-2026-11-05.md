# Homologação — arquivos, recuperação e comunicação

Atualização de 05/11/2026, posterior à entrega fullscreen de Fretes Ativos.

## Implementado

- Arquivos de Mural, RH externo, Agenda e capas de clientes persistem em armazenamento privado no Firestore. Os handlers originais mantêm a autorização por módulo e registro.
- Conteúdo binário é validado, particionado e verificado por SHA-256. Imagens e anexos não são gravados como base64 nos documentos de estado nem nas respostas de idempotência.
- Chat permite arquivos, imagens, áudio e vídeo validados, com download condicionado à associação ativa à conversa. Remoção de mensagem ou participante bloqueia o acesso ao arquivo. O envio só informa sucesso após a resposta do servidor.
- A primeira conversa é carregada automaticamente; mensagens e arquivos permanecem após F5.
- Restauração operacional oferece prévia e confirmação e recupera somente registros ausentes. Conflitos e dados atuais são preservados. O arquivo precisa corresponder ao hash de uma exportação auditada deste ambiente.
- Vencimentos de solicitações são avaliados ao consultar a fila e persistidos no servidor, com deduplicação por vencimento. Não há promessa de execução agendada quando ninguém consulta o portal.
- Quinze PDFs legados foram movidos de `public/` para `resources/legacy-documents/`, sem alterar seus bytes. Links antigos redirecionam ao endpoint autorizado. O administrador consulta o acervo; demais usuários acessam arquivos vinculados a comunicados/eventos visíveis.

## Verificação

`npm run cloud:test`: seis testes de integração, com cenários novos para arquivos corporativos, associação de conversas, reinício da API, restauração, concorrência do SLA e documentos legados.

Nove regressões locais: Mural, enquetes, Agenda, RH externo e contrato bancário, capas, modalidades financeiras e envio de anexos.

TypeScript geral/API e build Vite aprovados. Login, restauração de um registro fictício, upload no chat, F5 e logout conferidos no navegador contra emuladores. Nenhum usuário, frete ou pagamento real foi usado nesses testes.

## Limites atuais

- Novos arquivos: 3 MB por arquivo e corpo de envio limitado pela hospedagem; múltiplos arquivos podem exigir envios menores. Capacidade lógica compartilhada de arquivos: 128 MB nesta homologação.
- Restauração: exportações de até 2 MB e até 440 registros ausentes por transação. Arquivos binários, credenciais, conversas privadas e registros financeiros não estão na exportação operacional.
- Diretório e algumas consultas financeiras continuam limitados a 500 registros. A partição/paginação para volumes maiores exige uma etapa própria antes de ampliar o uso.
- A proteção dos PDFs vale para esta versão do site. As cópias anteriores no histórico Git e nos deployments antigos não foram removidas.
- As confirmações com contas reais na Preview e a preparação/publicação de produção permanecem separadas da verificação em emuladores.

## Banco do RH

O banco escolhido é o C6 Bank. A variável de configuração `RODOVAR_RH_BILLING_PROVIDER=C6_BANK`, restrita à Preview/branch de homologação, identifica a escolha e não habilita emissão ou confirmação bancária.

A integração real depende do credenciamento, credenciais de teste, contrato técnico e homologação do banco. Não inferir endpoints ou autenticação a partir de agência, conta ou chave Pix. Dados bancários fornecidos pelo operador e credenciais não devem entrar no repositório. A emissão e a confirmação continuam bloqueadas até uma integração oficial validada.

Referência: https://www.c6bank.com.br/apis-integracao/
