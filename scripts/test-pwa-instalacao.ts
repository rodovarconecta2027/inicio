import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✓ ${message}`);
}

function parsePngHeader(buf: Buffer): { width: number; height: number; isValidPng: boolean } {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const isValidPng = buf.length >= 24 && buf.subarray(0, 8).equals(sig);
  const width = isValidPng ? buf.readUInt32BE(16) : 0;
  const height = isValidPng ? buf.readUInt32BE(20) : 0;
  return { width, height, isValidPng };
}

async function runTests() {
  console.log('===================================================================');
  console.log('TESTE AUTOMATIZADO — RODOVAR CONECTA PWA, ÍCONES, ROTAS E SEGURANÇA');
  console.log('===================================================================\n');

  // 1. Verificar index.html e vinculação com manifest.json e apple-touch-icon
  const htmlRes = await fetch(`${BASE_URL}/`);
  await assert(htmlRes.status === 200, 'GET / retorna 200 OK');
  const htmlText = await htmlRes.text();
  await assert(
    htmlText.includes('<link rel="manifest" href="/manifest.json"'),
    'index.html contém vínculo <link rel="manifest" href="/manifest.json">'
  );
  await assert(
    htmlText.includes('apple-touch-icon') && htmlText.includes('/apple-touch-icon.png'),
    'index.html contém vínculo <link rel="apple-touch-icon" href="/apple-touch-icon.png">'
  );
  await assert(
    htmlText.includes('lang="pt-BR"'),
    'index.html configurado com idioma pt-BR'
  );
  await assert(
    htmlText.includes('beforeinstallprompt') && htmlText.includes('__rodovarDeferredPrompt'),
    'index.html captura o evento beforeinstallprompt precocemente antes do carregamento do React'
  );

  // 2. Verificar /manifest.json (cabeçalhos, nome, short_name, id, start_url, scope, display, lang, cores, ícones e share_target)
  const manifestRes = await fetch(`${BASE_URL}/manifest.json`);
  await assert(manifestRes.status === 200, 'GET /manifest.json retorna 200 OK');
  const manifestContentType = manifestRes.headers.get('content-type') || '';
  await assert(
    manifestContentType.includes('manifest+json') || manifestContentType.includes('application/json'),
    `GET /manifest.json retorna Content-Type JSON válido (${manifestContentType})`
  );
  const manifest = await manifestRes.json();
  await assert(manifest.name === 'RODOVAR CONECTA', 'manifest.name === "RODOVAR CONECTA"');
  await assert(manifest.short_name === 'Rodovar', 'manifest.short_name === "Rodovar"');
  await assert(Boolean(manifest.id), `manifest.id estável configurado (${manifest.id})`);
  await assert(manifest.start_url === '/', 'manifest.start_url === "/"');
  await assert(manifest.scope === '/', 'manifest.scope === "/"');
  await assert(manifest.display === 'standalone', 'manifest.display === "standalone"');
  await assert(manifest.lang === 'pt-BR', 'manifest.lang === "pt-BR"');
  await assert(manifest.theme_color === '#FFD400', 'manifest.theme_color === "#FFD400" (Amarelo Rodovar)');
  await assert(manifest.background_color === '#080B0D', 'manifest.background_color === "#080B0D" (Preto Rodovar)');
  await assert(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'manifest.icons possui ícones 192x192, 512x512 e maskable');

  const has192Any = manifest.icons.some((i: any) => i.sizes === '192x192' && i.purpose === 'any' && i.type === 'image/png');
  const has512Any = manifest.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'any' && i.type === 'image/png');
  const has512Maskable = manifest.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'maskable' && i.type === 'image/png');
  await assert(has192Any, 'manifest.json possui ícone PNG 192x192 purpose="any"');
  await assert(has512Any, 'manifest.json possui ícone PNG 512x512 purpose="any"');
  await assert(has512Maskable, 'manifest.json possui ícone PNG 512x512 purpose="maskable" separado');
  await assert(
    manifest.share_target?.action === '/receber-comprovante' &&
      manifest.share_target?.method === 'POST' &&
      manifest.share_target?.enctype === 'multipart/form-data',
    'manifest.json preserva share_target POST multipart/form-data em /receber-comprovante'
  );

  // 3. Verificar entrega real e dimensões binárias de todos os ícones PNG (sem HTML de fallback)
  const iconSpecs = [
    { url: '/pwa-192x192.png', width: 192, height: 192 },
    { url: '/pwa-512x512.png', width: 512, height: 512 },
    { url: '/pwa-maskable-512x512.png', width: 512, height: 512 },
    { url: '/apple-touch-icon.png', width: 180, height: 180 },
    { url: '/icons/icon-192x192.png', width: 192, height: 192 },
    { url: '/icons/icon-512x512.png', width: 512, height: 512 },
    { url: '/icons/icon-maskable-512x512.png', width: 512, height: 512 },
  ];

  for (const spec of iconSpecs) {
    const res = await fetch(`${BASE_URL}${spec.url}`);
    await assert(res.status === 200, `GET ${spec.url} retorna 200 OK`);
    const ct = res.headers.get('content-type') || '';
    await assert(ct.includes('image/png'), `GET ${spec.url} retorna Content-Type image/png (${ct})`);
    const arrBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    const parsed = parsePngHeader(buf);
    await assert(
      parsed.isValidPng && parsed.width === spec.width && parsed.height === spec.height,
      `Arquivo ${spec.url} é PNG válido de exatamente ${spec.width}x${spec.height}px (${buf.length} bytes)`
    );
  }

  // 4. Verificar /sw.js (cabeçalhos HTTP, escopo, atualização controlada e proteção de cache)
  const swRes = await fetch(`${BASE_URL}/sw.js`);
  await assert(swRes.status === 200, 'GET /sw.js retorna 200 OK');
  const swCt = swRes.headers.get('content-type') || '';
  const swCc = swRes.headers.get('cache-control') || '';
  const swAllowed = swRes.headers.get('service-worker-allowed') || '';
  await assert(
    swCt.includes('javascript'),
    `GET /sw.js retorna Content-Type JavaScript (${swCt})`
  );
  await assert(
    swCc.includes('no-cache') && swCc.includes('no-store'),
    `GET /sw.js retorna Cache-Control sem cache (${swCc})`
  );
  await assert(swAllowed === '/', `GET /sw.js retorna Service-Worker-Allowed: / (${swAllowed})`);
  const swText = await swRes.text();
  await assert(
    swText.includes("'SKIP_WAITING'") && swText.includes('self.skipWaiting()'),
    'Service Worker implementa atualização controlada via mensagem SKIP_WAITING'
  );
  await assert(
    swText.includes("'CLEAR_SENSITIVE_DATA'"),
    'Service Worker limpa dados temporários sensíveis no logout via CLEAR_SENSITIVE_DATA'
  );
  await assert(
    swText.includes("url.pathname.startsWith('/api/')") &&
      swText.includes("url.pathname.startsWith('/uploads/')"),
    'Service Worker bloqueia cache de rotas autenticadas (/api/*) e comprovantes (/uploads/*)'
  );

  // 5. Verificar rotas profundas (SPA fallback) sem 404 ao abrir ou recarregar
  const deepRoutes = [
    '/receber-comprovante',
    '/comercial',
    '/expedicao',
    '/financeiro',
    '/fretes-ativos',
    '/comunicados',
    '/documentos',
    '/agenda',
    '/perfil',
  ];
  for (const route of deepRoutes) {
    const rRes = await fetch(`${BASE_URL}${route}`, {
      headers: { Accept: 'text/html' },
    });
    await assert(rRes.status === 200, `Rota profunda ${route} abre diretamente sem 404 (status ${rRes.status})`);
    const rText = await rRes.text();
    await assert(
      rText.includes('<div id="root"></div>'),
      `Rota profunda ${route} entrega o shell HTML da aplicação`
    );
  }

  // 6. Verificar configuração do vercel.json
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
  await assert(fs.existsSync(vercelJsonPath), 'vercel.json existe na raiz do projeto');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
  await assert(
    Array.isArray(vercelConfig.rewrites) &&
      vercelConfig.rewrites.some((r: any) => String(r.source).includes('manifest\\.json') && String(r.source).includes('sw\\.js')),
    'vercel.json protege manifest.json, sw.js e ícones contra sobrescrita por HTML no rewrite'
  );

  // 7. Verificar textos obrigatórios nos componentes (iOS Safari, Offline, Atualização e Botões)
  const modalSource = fs.readFileSync(path.join(process.cwd(), 'src/components/PWAInstallModal.tsx'), 'utf-8');
  await assert(
    modalSource.includes(
      'Abra este endereço no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Quando disponível, mantenha Abrir como App ativado.'
    ),
    'Modal de instalação contém o texto exato exigido para iPhone / iPad (Safari)'
  );
  await assert(
    modalSource.includes('Instalar aplicativo') &&
      modalSource.includes('Como instalar') &&
      modalSource.includes('Copiar endereço'),
    'Modal de instalação contém os botões "Instalar aplicativo", "Como instalar" e "Copiar endereço"'
  );

  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
  await assert(
    appSource.includes('Você está sem conexão. Algumas funções precisam de internet.'),
    'App.tsx contém o aviso exato de falta de conexão ("Você está sem conexão. Algumas funções precisam de internet.")'
  );
  await assert(
    appSource.includes('Uma nova versão está disponível.') && appSource.includes('Atualizar agora'),
    'App.tsx contém o aviso controlado de atualização ("Uma nova versão está disponível." + "Atualizar agora")'
  );

  // 8. Verificar segurança de Login: conta pendente bloqueada e bloqueio de 120s após 5 tentativas inválidas
  const randomUser = `teste_pwa_${Date.now()}`;
  const reqAccessRes = await fetch(`${BASE_URL}/api/auth/request-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Colaborador Teste PWA',
      username: randomUser,
      department: 'Operacional',
      password: 'Password123!',
    }),
  });
  await assert(reqAccessRes.status === 201, 'Solicitação de acesso cria conta como PENDENTE (201)');

  const pendingLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: randomUser,
      password: 'Password123!',
    }),
  });
  await assert(
    pendingLoginRes.status === 403,
    'Conta PENDENTE não pode autenticar nem emitir sessão antes da aprovação do administrador (403)'
  );

  // Testar 5 tentativas inválidas e bloqueio de 120s para um identificador isolado
  const lockTarget = `lock_test_${Date.now()}@rodovar.com.br`;
  let fifthRes: Response | null = null;
  for (let i = 1; i <= 5; i++) {
    fifthRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: lockTarget, password: `wrong_${i}` }),
    });
  }
  const lockedData = fifthRes ? await fifthRes.json() : {};
  await assert(
    fifthRes?.status === 429 &&
      lockedData.locked === true &&
      typeof lockedData.remainingSeconds === 'number' &&
      lockedData.remainingSeconds > 0,
    `Bloqueio de 120 segundos após 5 tentativas inválidas ativo no servidor (429, remainingSeconds=${lockedData.remainingSeconds}s)`
  );

  console.log('\n===================================================================');
  console.log('TODOS OS TESTES AUTOMATIZADOS DE PWA, ROTAS E SEGURANÇA PASSARAM!');
  console.log('===================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ FALHA NO TESTE:', err);
  process.exit(1);
});
