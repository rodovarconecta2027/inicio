import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker() {
  const events: Record<string,any> = {};
  const context = vm.createContext({URL,Request,Response,Headers,console,
    self:{location:{origin:'https://portal.example.test'},addEventListener:(name:string,callback:any)=>{events[name]=callback;},clients:{claim:async()=>{}},skipWaiting(){}},
    caches:{keys:async()=>[],delete:async()=>true},
  });
  vm.runInContext(fs.readFileSync('public/sw.js','utf8'),context);
  return {context,events};
}

test('PWA não intercepta PDFs, APIs nem imagens com sessão autorizada',()=>{
  const {events}=worker();
  for (const [path,headers] of [
    ['/assets/documento.pdf',{}],['/assets/documento.PDF',{}],['/api/cloud/chat/messages/one/attachment',{}],
    ['/assets/avatar.png',{'X-Rodovar-Session':'sessao-de-teste'}],
  ] as const) {
    let intercepted=false;
    events.fetch({request:new Request('https://portal.example.test'+path,{headers}),respondWith(){intercepted=true;}});
    assert.equal(intercepted,false,path);
  }
});

test('PWA rejeita cache privado, no-store e respostas redirecionadas',()=>{
  const {context}=worker();
  const response=(cacheControl:string,redirected=false)=>({status:200,type:'basic',redirected,headers:new Headers({'Cache-Control':cacheControl})});
  assert.equal(context.canCacheShellResponse(response('public, max-age=3600')),true);
  assert.equal(context.canCacheShellResponse(response('private, max-age=3600')),false);
  assert.equal(context.canCacheShellResponse(response('no-store')),false);
  assert.equal(context.canCacheShellResponse(response('public',true)),false);
});

test('PWA ativa uma versão nova e elimina caches da versão anterior',async()=>{
  const {context,events}=worker();let pending:Promise<unknown>|undefined;const removed:string[]=[];
  context.caches={keys:async()=>['rodovar-conecta-shell-2026.10.28-v3',vm.runInContext('CACHE_NAME',context)],delete:async(key:string)=>{removed.push(key);return true;}};
  events.activate({waitUntil(promise:Promise<unknown>){pending=promise;}});await pending;
  assert.deepEqual(removed,['rodovar-conecta-shell-2026.10.28-v3']);
});
