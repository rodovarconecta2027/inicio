import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express } from 'express';
import { hasPagePermission } from '../lib/permissions';

export interface RhBillingProvider {
  name: string;
  issue(input: { idempotencyKey:string; amountCents:number; dueDate:string; customer:any; description:string }): Promise<{id:string; pdf:Buffer}>;
  lookup(id:string): Promise<{id:string; status:'OPEN'|'PAID'; amountCents:number; paidAmountCents?:number; currency:'BRL'; paidAt?:string}>;
  verifyWebhook(raw:Buffer, headers:Record<string,unknown>): Promise<{eventId:string; chargeId:string}>;
}
export const canAccessExternalRh = (u:any) => !!u && u.accessProfile === 'RH' && hasPagePermission(u,'solicitacoes');
function validDocument(value:string) {
  if(![11,14].includes(value.length)||/^(\d)\1+$/.test(value))return false;
  const digit=(base:string,weights:number[])=>{const sum=[...base].reduce((n,c,i)=>n+Number(c)*weights[i],0),remainder=sum%11;return remainder<2?0:11-remainder;};
  if(value.length===11){const first=digit(value.slice(0,9),[10,9,8,7,6,5,4,3,2]);return first===Number(value[9])&&digit(value.slice(0,10),[11,10,9,8,7,6,5,4,3,2])===Number(value[10]);}
  return digit(value.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])===Number(value[12])&&digit(value.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(value[13]);
}

export function registerExternalRh(app:Express, guard:any, provider?:RhBillingProvider) {
  const dir=path.join(process.env.RODOVAR_DATA_ROOT || process.cwd(),'data','rh-external');
  fs.mkdirSync(dir,{recursive:true});
  const keyFile=path.join(dir,'encryption.key');
  if(!fs.existsSync(keyFile)) fs.writeFileSync(keyFile,crypto.randomBytes(32),{mode:0o600,flag:'wx'});
  const key=fs.readFileSync(keyFile), file=path.join(dir,'records.enc');
  const encrypt=(bytes:Buffer)=>{const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);};
  const decrypt=(bytes:Buffer)=>{const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);};
  const state:any=fs.existsSync(file)?JSON.parse(decrypt(fs.readFileSync(file)).toString()):{clients:[],services:[],requests:[],keys:{},events:{}};
  const save=()=>{fs.writeFileSync(file+'.tmp',encrypt(Buffer.from(JSON.stringify(state))),{mode:0o600});fs.renameSync(file+'.tmp',file);};
  const audit=(r:any,u:any,action:string)=>r.history.push({id:crypto.randomUUID(),at:new Date().toISOString(),actorId:u.id,actorName:u.name,action});
  const fail=(res:any,status:number,error:string)=>res.status(status).json({error});
  const rh=(req:any,res:any,next:any)=>canAccessExternalRh(req.sessionUser)?(res.setHeader('Cache-Control','no-store'),next()):fail(res,403,'Acesso exclusivo à permissão RH.');
  const find=(id:string)=>state.requests.find((r:any)=>r.id===id);
  const locks=new Set<string>();
  const storeDoc=(r:any,name:string,mimeType:string,bytes:Buffer,kind:string,u:any)=>{
    const id=crypto.randomUUID();fs.writeFileSync(path.join(dir,id+'.enc'),encrypt(bytes),{mode:0o600});
    const doc={id,name:name.replace(/[\r\n<>"/\\]/g,'_').slice(0,150),mimeType,size:bytes.length,kind,at:new Date().toISOString()};r.documents.push(doc);audit(r,u,'Documento anexado: '+kind);return doc;
  };
  app.get('/api/rh-external',guard,rh,(_req,res)=>res.json({requests:state.requests,services:state.services,provider:{configured:!!provider,name:provider?.name || null}}));
  app.post('/api/rh-external',guard,rh,(req:any,res)=>{
    const b=req.body||{}, name=String(b.clientName||'').trim(), document=String(b.document||'').replace(/\D/g,''), service=String(b.service||'').trim(), reference=String(b.reference||'').trim(), email=String(b.email||'').trim(), dueDate=String(b.dueDate||'');
    const amountCents=b.amountCents, idempotency=String(req.headers['x-idempotency-key']||'');
    if(!idempotency||idempotency.length>160) return fail(res,400,'Identificador do envio obrigatório.');
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex'), composite=req.sessionUser.id+':'+idempotency;
    if(state.keys[composite]) {const old=state.keys[composite];return old.fingerprint===fingerprint?res.json({request:find(old.id)}):fail(res,409,'Identificador já utilizado com dados diferentes.');}
    if(name.length<2||name.length>160||!validDocument(document)||!service||service.length>160||!reference||reference.length>100||!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>100000000||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||Number.isNaN(Date.parse(dueDate))||email.length>180||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return fail(res,400,'Confira cliente, CPF/CNPJ, serviço, referência, valor e vencimento.');
    const businessKey=crypto.createHash('sha256').update(document+'|'+service.toLocaleLowerCase('pt-BR')+'|'+reference.toLocaleLowerCase('pt-BR')).digest('hex');
    if(state.requests.some((r:any)=>r.businessKey===businessKey)) return fail(res,409,'Já existe atendimento para este cliente, serviço e referência.');
    let client=state.clients.find((c:any)=>c.document===document);
    if(client&&(client.name!==name||client.email!==email)) return fail(res,409,'Cliente já cadastrado com dados diferentes. Confira a identidade antes de reutilizar.');
    if(!client){client={id:crypto.randomUUID(),name,document,email};state.clients.push(client);}
    let catalog=state.services.find((s:any)=>s.name.toLocaleLowerCase('pt-BR')===service.toLocaleLowerCase('pt-BR'));
    if(!catalog){catalog={id:crypto.randomUUID(),name:service};state.services.push(catalog);}
    const r={id:crypto.randomUUID(),protocol:'RH-EXT-'+String(state.requests.length+1).padStart(6,'0'),client:{...client},serviceId:catalog.id,service:catalog.name,reference,amountCents,dueDate,businessKey,status:'Solicitação',createdAt:new Date().toISOString(),documents:[],history:[],notes:[]};
    audit(r,req.sessionUser,'Solicitação cadastrada');state.requests.unshift(r);state.keys[composite]={id:r.id,fingerprint};save();res.status(201).json({request:r});
  });
  app.post('/api/rh-external/:id/action',guard,rh,async(req:any,res)=>{
    const r=find(req.params.id);if(!r)return fail(res,404,'Atendimento não encontrado.');
    const action=req.body?.action;
    if(action==='ANALYZE'&&r.status==='Solicitação'){r.status='Análise';audit(r,req.sessionUser,'Encaminhado para análise');save();return res.json({request:r});}
    if(action==='NOTE'){const text=String(req.body?.text||'').trim();if(!text||text.length>3000)return fail(res,400,'Informe uma observação de até 3000 caracteres.');r.notes.push({id:crypto.randomUUID(),text,actorName:req.sessionUser.name,at:new Date().toISOString()});audit(r,req.sessionUser,'Observação registrada');save();return res.json({request:r});}
    if(action==='COMPLETE'&&r.status==='Pago'&&r.bankConfirmation){r.status='Concluído';audit(r,req.sessionUser,'Atendimento concluído');save();return res.json({request:r});}
    if(!['ISSUE','CONSULT'].includes(action))return fail(res,409,'Transição não permitida. Pagamento exige confirmação bancária validada.');
    if(!provider)return fail(res,503,'Provedor bancário oficial ainda não configurado. Nenhum boleto foi emitido.');
    if(locks.has(r.id))return fail(res,409,'Operação bancária em andamento.');locks.add(r.id);
    try {
      if(action==='ISSUE'){
        if(r.chargeId)return res.json({request:r});
        if(r.status!=='Análise')return fail(res,409,'Atendimento deve estar em análise.');
        const issued=await provider.issue({idempotencyKey:r.id,amountCents:r.amountCents,dueDate:r.dueDate,customer:r.client,description:r.service+' · '+r.reference});
        if(!issued.id||issued.pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Resposta bancária inválida');
        if(state.requests.some((item:any)=>item.id!==r.id&&item.chargeId===issued.id))throw Error('Identificador bancário duplicado');
        r.chargeId=issued.id;r.status='Boleto Emitido';storeDoc(r,'Boleto-'+r.protocol+'.pdf','application/pdf',issued.pdf,'Boleto',req.sessionUser);audit(r,req.sessionUser,'Boleto emitido pelo provedor oficial');save();
      } else {
        if(!r.chargeId)return fail(res,409,'Boleto ainda não emitido.');
        await reconcile(r,await provider.lookup(r.chargeId),req.sessionUser);save();
      }
      res.json({request:r});
    } catch {fail(res,502,'Não foi possível validar a operação no provedor bancário. Tente consultar novamente.');} finally {locks.delete(r.id);}
  });
  async function reconcile(r:any,charge:Awaited<ReturnType<RhBillingProvider['lookup']>>,actor:any){
    if(charge.id!==r.chargeId||charge.currency!=='BRL'||charge.amountCents!==r.amountCents)throw Error('Cobrança divergente');
    if(charge.status==='PAID'){
      if(charge.paidAmountCents!==r.amountCents||!charge.paidAt||Number.isNaN(Date.parse(charge.paidAt)))throw Error('Liquidação inválida');
      if(!r.bankConfirmation){r.bankConfirmation={chargeId:charge.id,paidAmountCents:charge.paidAmountCents,paidAt:charge.paidAt,verifiedAt:new Date().toISOString(),provider:provider!.name};r.status='Pago';audit(r,actor,'Pagamento confirmado após consulta autenticada ao banco');}
    }else if(r.status==='Boleto Emitido'){r.status='Aguardando Pagamento';audit(r,actor,'Cobrança consultada: aguardando pagamento');}
  }
  app.post('/api/rh-external/webhook',async(req:any,res)=>{
    if(!provider)return fail(res,503,'Integração bancária não configurada.');
    try {
      if(!Buffer.isBuffer(req.rawBody))return fail(res,400,'Conteúdo original do webhook indisponível.');
      if(req.rawBody.length>65536)return fail(res,413,'Evento bancário acima do tamanho permitido.');
      const event=await provider.verifyWebhook(req.rawBody,req.headers);
      if(!event.eventId||!event.chargeId)return fail(res,401,'Evento bancário não validado.');
      if(state.events[event.eventId])return res.json({ok:true});
      const r=state.requests.find((r:any)=>r.chargeId===event.chargeId);if(!r)return fail(res,404,'Cobrança não encontrada.');
      if(locks.has(r.id))return fail(res,409,'Conciliação em andamento.');locks.add(r.id);
      try{await reconcile(r,await provider.lookup(r.chargeId),{id:'BANK',name:provider.name});state.events[event.eventId]=new Date().toISOString();save();}finally{locks.delete(r.id);}
      res.json({ok:true});
    }catch{fail(res,401,'Webhook não validado. Nenhum pagamento confirmado.');}
  });
  app.post('/api/rh-external/:id/documents',guard,rh,(req:any,res)=>{
    const r=find(req.params.id);if(!r)return fail(res,404,'Atendimento não encontrado.');
    const name=String(req.body?.name||''), kind=req.body?.kind==='Comprovante'?'Comprovante':'Documento';
    const match=/^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(req.body?.dataUrl||''));
    if(!match||!name)return fail(res,400,'Envie PDF, PNG ou JPEG.');const bytes=Buffer.from(match[2],'base64');
    const valid=match[1]==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid||bytes.length>5*1024*1024)return fail(res,400,'Formato inválido ou arquivo maior que 5 MB.');
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(r.documents.some((d:any)=>d.hash===hash))return res.json({request:r});
    const doc=storeDoc(r,name,match[1],bytes,kind,req.sessionUser);Object.assign(doc,{hash});save();res.status(201).json({request:r});
  });
  app.get('/api/rh-external/:id/documents/:documentId',guard,rh,(req:any,res)=>{
    const r=find(req.params.id),doc=r?.documents.find((d:any)=>d.id===req.params.documentId);if(!doc)return fail(res,404,'Documento não encontrado.');
    audit(r,req.sessionUser,'Download de documento: '+doc.kind);save();res.setHeader('X-Content-Type-Options','nosniff');res.type(doc.mimeType).attachment(doc.name).send(decrypt(fs.readFileSync(path.join(dir,doc.id+'.enc'))));
  });
}
