import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
for(const origin of ['http://127.0.0.1:3000','http://192.168.100.7:3000']){
 for(let i=0;i<2;i++){const r=await fetch(origin+'/',{headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('id="portal-loading"'));assert.ok(html.includes('data-portal-loading="true"'));assert.ok(html.includes('Preparando seu ambiente...'));}
 const cssResponse=await fetch(origin+'/portal-loading.css');assert.equal(cssResponse.status,200);assert.match(cssResponse.headers.get('content-type')||'',/css/);const css=await cssResponse.text();assert.ok(css.includes('prefers-reduced-motion:reduce'));
 for(const name of ['mascote','logo']){const response=await fetch(origin+'/assets/loading/'+name+'.png');assert.equal(response.status,200);const actual=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync('public/assets/loading/'+name+'.png')).digest('hex'));}
 console.log(origin+': loading inicial no HTML, F5, CSS, movimento reduzido e imagens originais OK');
}
