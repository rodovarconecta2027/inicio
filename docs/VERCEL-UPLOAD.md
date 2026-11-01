# Pacote manual para GitHub e Vercel

O arquivo de entrega contém o código-fonte validado, o build em `dist/`, os assets públicos e as configurações de CI/Vercel.

## Conteúdo removido do pacote

- banco local, contas, sessões e históricos privados (`data/`);
- uploads gerados durante o uso (`public/uploads/` e `uploads/`);
- arquivos `.env`, credenciais, chaves e metadados do projeto Firebase antigo;
- cache dos emuladores, Java portátil, logs, backups e configuração local `.vercel/`;
- `node_modules/`.

## Envio recomendado

1. Extraia o ZIP.
2. Envie os arquivos extraídos para um repositório privado do GitHub.
3. No Vercel, importe esse repositório.
4. Framework: Vite. Build: `npm run build`. Saída: `dist`.

## Limite atual importante

O frontend e o build estão prontos para apresentação visual. O servidor Express e a persistência operacional ainda dependem do runtime local; a Vercel não oferece disco persistente para os arquivos JSON do portal. Não configure o Firebase Emulator na Vercel. A publicação plenamente funcional exige concluir a migração dos módulos operacionais para serviços persistentes remotos antes de liberar contas reais.
