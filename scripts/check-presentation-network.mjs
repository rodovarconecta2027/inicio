import assert from 'node:assert/strict';
for(const origin of ['http://127.0.0.1:3000','http://192.168.100.7:3000']){
 const root=await fetch(origin+'/');assert.equal(root.status,200);const html=await root.text();assert.ok(html.includes('rel="manifest"'));
 const manifestResponse=await fetch(origin+'/manifest.json');assert.equal(manifestResponse.status,200);const manifest=await manifestResponse.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons){const r=await fetch(origin+icon.src);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(1,4).toString(),'PNG');const [w,h]=icon.sizes.split('x').map(Number);assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);}
 const sw=await fetch(origin+'/sw.js');assert.equal(sw.status,200);assert.match(sw.headers.get('content-type')||'',/javascript/);const worker=await sw.text();assert.ok(worker.includes("addEventListener('fetch'"));assert.ok(worker.includes('SKIP_WAITING'));
 for(const path of ['/comunicados?registro=ann-1','/agenda?registro=evt-2','/solicitacoes?registro=req-1025','/fretes-ativos?registro=freight-3']){for(let reload=0;reload<2;reload++){const r=await fetch(origin+path,{headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200);const body=await r.text();assert.ok(body.includes('id="root"'));}}
 console.log(origin+': manifest, dimensões dos ícones, Service Worker e rotas diretas após recarga OK');
}
