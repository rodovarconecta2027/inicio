import React,{useEffect,useRef,useState} from 'react';
import {ImagePlus} from 'lucide-react';
import {getAuthHeaders} from '../lib/serverApi';
import './CustomerCover.css';
const key=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
let loadingCovers: Promise<any> | null = null;
function loadCovers(){
 if(!loadingCovers) loadingCovers=fetch('/api/customer-covers',{headers:getAuthHeaders()}).then(async r=>{if(!r.ok)throw Error('Não foi possível carregar as capas.');return r.json();}).finally(()=>{loadingCovers=null;});
 return loadingCovers;
}
export function CustomerCover({customer}:{customer:string}){
 const [image,setImage]=useState(''),[canEdit,setCanEdit]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{let active=true;const load=()=>loadCovers().then(d=>{if(active){setImage(d.covers.find((c:any)=>c.key===key(customer))?.dataUrl||'');setCanEdit(d.canEdit);}}).catch(e=>{if(active)setError(e.message);});void load();window.addEventListener('rodovar:customer-cover',load);return()=>{active=false;window.removeEventListener('rodovar:customer-cover',load);};},[customer]);
 async function upload(file?:File){if(!file||busy)return;if(file.size>3*1024*1024){setError('Escolha uma imagem de até 3 MB.');return;}setBusy(true);setError('');try{const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});const r=await fetch('/api/customer-covers',{method:'PUT',headers:getAuthHeaders(),body:JSON.stringify({customer,dataUrl})});const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível salvar a capa.');setImage(d.cover.dataUrl);window.dispatchEvent(new Event('rodovar:customer-cover'));}catch(e){setError((e as Error).message);}finally{setBusy(false);if(input.current)input.current.value='';}}
 return <div className="customer-cover" onClick={e=>e.stopPropagation()}><img src={image||'/assets/banner-rodovar-truck.jpg'} alt={image?`Capa de ${customer}`:''} width="500" height="255" loading="lazy" decoding="async"/><span className="customer-cover-caption">{image?'Capa do cliente':'Imagem institucional Rodovar'}</span>{canEdit&&<><button type="button" disabled={busy} onClick={()=>input.current?.click()} aria-label={`Trocar capa de ${customer}`} title="Salva a capa para todos os fretes deste cliente"><ImagePlus size={14}/>{busy?'Salvando…':'Trocar capa'}</button><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></>}{error&&<p role="alert">{error}</p>}</div>;
}
