import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {Express} from 'express';
export const canManagePolls=(u:any)=>u?.accessLevel==='ADMINISTRADOR'||['DIRETORIA','FINANCEIRO','RH'].includes(u?.accessProfile)||u?.accessLevel==='DIRETORIA'||u?.roleTitle==='Gerência Administrativa';
export function registerPolls(app:Express,guard:any,storageFile=path.join(process.env.RODOVAR_DATA_ROOT||process.cwd(),'data','mural-polls.local.json'),remotePolls?:any[]){
 const polls:any[]=remotePolls||(fs.existsSync(storageFile)?JSON.parse(fs.readFileSync(storageFile,'utf8')):[]);
 if(!Array.isArray(polls))throw Error('Arquivo local de enquetes inválido.');
 const save=()=>{if(remotePolls)return;fs.mkdirSync(path.dirname(storageFile),{recursive:true});const temporary=storageFile+'.tmp';fs.writeFileSync(temporary,JSON.stringify(polls),{mode:0o600});fs.renameSync(temporary,storageFile);};
 app.use('/api/mural-polls',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 const view=(p:any,u:any)=>{const total=Object.keys(p.votes).length,own=p.votes[u.id],ended=p.closed||Date.now()>=Date.parse(p.deadline),show=canManagePolls(u)||p.results==='always'||own!==undefined||ended;return {id:p.id,question:p.question,options:p.options,deadline:p.deadline,closed:ended,draft:p.draft,results:p.results,total,own,counts:show?p.options.map((_:any,i:number)=>Object.values(p.votes).filter(v=>v===i).length):null};};
 app.get('/api/mural-polls',guard,(req:any,res)=>res.json({canManage:canManagePolls(req.sessionUser),polls:polls.filter(p=>!p.draft||canManagePolls(req.sessionUser)).map(p=>view(p,req.sessionUser))}));
 app.post('/api/mural-polls',guard,(req:any,res)=>{const u=req.sessionUser,b=req.body||{};if(!canManagePolls(u))return res.status(403).json({error:'Sem permissão para administrar enquetes.'});let p=polls.find(p=>p.id===b.id);if(b.action==='close'){if(!p)return res.status(404).json({error:'Enquete indisponível.'});p.closed=true;save();return res.json(view(p,u));}
 const options=Array.isArray(b.options)?b.options.map((v:any)=>String(v).trim()):[];if(!String(b.question||'').trim()||String(b.question).length>240||options.length<2||options.length>6||options.some((v:string)=>!v||v.length>120)||new Set(options).size!==options.length||!Number.isFinite(Date.parse(b.deadline))||Date.parse(b.deadline)<=Date.now())return res.status(400).json({error:'Informe pergunta, 2 a 6 alternativas distintas e prazo futuro.'});
 if(p&&(Object.keys(p.votes).length||p.closed))return res.status(409).json({error:'Enquetes com votos ou encerradas não podem ser editadas.'});
 if(!p){p={id:crypto.randomUUID(),votes:{},closed:false};polls.push(p);}Object.assign(p,{question:String(b.question).trim(),options,deadline:b.deadline,draft:!!b.draft,results:b.results==='always'?'always':'after',authorId:u.id});save();res.json(view(p,u));});
 app.post('/api/mural-polls/:id/vote',guard,(req:any,res)=>{const p=polls.find(p=>p.id===req.params.id),u=req.sessionUser,i=req.body?.option;if(!p||p.draft)return res.status(404).json({error:'Enquete indisponível.'});if(p.closed||Date.now()>=Date.parse(p.deadline))return res.status(409).json({error:'Votação encerrada.'});if(!Number.isInteger(i)||i<0||i>=p.options.length)return res.status(400).json({error:'Alternativa inválida.'});if(p.votes[u.id]!==undefined){if(p.votes[u.id]!==i)return res.status(409).json({error:'Seu voto já foi registrado.'});return res.json(view(p,u));}p.votes[u.id]=i;save();res.json(view(p,u));});
}
