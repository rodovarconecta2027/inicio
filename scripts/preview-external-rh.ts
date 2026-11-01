// Isolated visual QA only. Never loaded by the production server.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {build} from 'esbuild';
import {registerExternalRh} from '../src/server/externalRh';
const out=path.resolve('../rh-preview');fs.mkdirSync(out,{recursive:true});
await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{ExternalRhView}from'./src/components/ExternalRhView';import './src/components/ExternalRh.css';createRoot(document.getElementById('root')).render(React.createElement(ExternalRhView));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:path.join(out,'bundle.js'),format:'esm'});
process.env.RODOVAR_DATA_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-rh-visual-'));
const app=express();app.use(express.json());
registerExternalRh(app,(req:any,_res:any,next:any)=>{req.sessionUser={id:'isolated-visual-test',name:'QA isolada',accessProfile:'RH',accessLevel:'FUNCIONARIO',active:true,approvalStatus:'APROVADO'};next();});
app.use(express.static(out));
app.get('/portal.css',(_req,res)=>res.sendFile(path.resolve('dist/assets',fs.readdirSync('dist/assets').find(f=>f.endsWith('.css'))!)));
app.get('/',(_req,res)=>res.send('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link href="/portal.css" rel="stylesheet"><link href="/bundle.css" rel="stylesheet"></head><body style="background:#f3f5f8;padding:24px"><div style="font:12px Inter,Arial;color:#637188;margin-bottom:16px">Conferência isolada — nenhum cadastro ou boleto real</div><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>'));
const server=app.listen(4318,'127.0.0.1',()=>process.stdout.write('RH visual QA ready on localhost:4318\n'));
setTimeout(()=>server.close(()=>process.exit(0)),300000).unref();
