import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import {hasPagePermission} from '../lib/permissions.js';
import {legacyDocumentCatalog} from './legacyDocumentCatalog.js';

function references(value:any,url:string):boolean {
  if(value===url)return true;
  return !!value && typeof value==='object' && Object.values(value).some(child=>references(child,url));
}

export function legacyDocumentVisible(user:any,url:string,mural:any,agenda:any) {
  if(user.accessLevel==='ADMINISTRADOR')return true;
  const publisher=['ADMINISTRADOR','DIRETORIA'].includes(user.accessLevel);
  if(hasPagePermission(user,'comunicados') && (mural?.announcements||[]).some((a:any)=>
    (publisher||!a.draft&&(a.targetAudience==='Todos'||a.targetAudience===user.department))&&references(a,url))) return true;
  return hasPagePermission(user,'agenda') && (agenda?.events||[]).some((event:any)=>
    (event.ownerId===user.id||event.visibility==='Todos'||event.invitees?.includes(user.id)||event.sectors?.includes(user.department))&&references(event,url));
}

export function registerLegacyDocumentRedirects(app:Express,prefix:string) {
  for(const file of legacyDocumentCatalog) app.get(file.source,(_req,res)=>{
    res.setHeader('Cache-Control','no-store');res.redirect(307,prefix+'/'+file.id);
  });
}

export function registerLegacyDocuments(app:Express,guard:RequestHandler,prefix:string,allowed:(user:any,url:string)=>Promise<boolean>,audit?:(user:any,id:string)=>Promise<void>) {
  app.get(prefix,guard,(req:any,res)=>{
    if(req.sessionUser.accessLevel!=='ADMINISTRADOR'){res.status(403).json({error:'Acervo legado restrito ao administrador.'});return;}
    res.json({documents:legacyDocumentCatalog.map(({id,name,size})=>({id,name,size,url:prefix+'/'+id}))});
  });
  app.get(prefix+'/:id',guard,async(req:any,res,next)=>{
    try {
      const file=legacyDocumentCatalog.find(file=>file.id===req.params.id);
      if(!file||!await allowed(req.sessionUser,file.source)){res.status(404).json({error:'Documento não encontrado ou não autorizado.'});return;}
      const bytes=await fs.readFile(path.resolve('resources/legacy-documents',file.name));
      if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Object.assign(Error('Integridade do documento não confirmada.'),{status:409});
      await audit?.(req.sessionUser,file.id);
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
      res.attachment(file.name).type('application/pdf').send(bytes);
    } catch(error){next(error);}
  });
}
