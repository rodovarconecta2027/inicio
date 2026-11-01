import {Express} from 'express';
import {canAccessMonitoramentoFreights,canOperateMonitoring} from '../lib/permissions';
export const customerCoverKey=(name:string)=>String(name||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function registerCustomerCovers(app:Express,guard:any,db:any,save:()=>void){
 const allowed=(u:any)=>canAccessMonitoramentoFreights(u);
 app.get('/api/customer-covers',guard,(req:any,res)=>{if(!allowed(req.sessionUser))return res.sendStatus(403);res.json({covers:db.customerCovers||[],canEdit:req.sessionUser.accessLevel==='ADMINISTRADOR'||canOperateMonitoring(req.sessionUser)});});
 app.put('/api/customer-covers',guard,(req:any,res)=>{
  const u=req.sessionUser;if(!(u.accessLevel==='ADMINISTRADOR'||canOperateMonitoring(u)))return res.sendStatus(403);
  const b=req.body||{},key=customerCoverKey(b.customer);if(!key||key.length>200)return res.status(400).json({error:'Cliente inválido.'});
  const match=/^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(b.dataUrl||''));
  if(!match)return res.status(400).json({error:'Escolha uma imagem PNG, JPG ou WebP.'});
  const bytes=Buffer.from(match[2],'base64'),valid=match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid||bytes.length>3*1024*1024)return res.status(400).json({error:'Imagem inválida ou acima de 3 MB.'});
  db.customerCovers ||= [];const cover={key,customer:String(b.customer).trim(),dataUrl:b.dataUrl,updatedBy:u.id,updatedAt:new Date().toISOString()};const index=db.customerCovers.findIndex((c:any)=>c.key===key);if(index<0)db.customerCovers.push(cover);else db.customerCovers[index]=cover;
  db.auditLogs ||= [];db.auditLogs.push({id:crypto.randomUUID(),action:'CUSTOMER_COVER_UPDATED',actorUserId:u.id,customer:cover.customer,atIso:cover.updatedAt});save();res.json({cover});
 });
}
