import fs from 'node:fs';
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));
edit('src/components/MuralPremium.tsx',s=>s.replace("import {jsPDF} from 'jspdf';\n",'').replace('Calendar,Crown,','Calendar,Presentation,').replace("['Diretoria',Crown]","['Diretoria',Presentation]").replace(/ const certificate=.*?\n/,'').replace(/ const exportCsv=.*?\n/,'').replace(/ const copyBulletin=.*?\n/,'').replace('<div className="mp-export-controls"><button onClick={copyBulletin}>Copiar boletim</button><button onClick={exportCsv}>Exportar CSV</button></div>','').replace('{detail.category} · {detail.priority}',"{[...new Set([detail.category,detail.priority].filter(v=>v&&v!=='Normal'))].join(' · ')}").replace('<button className="mp-confirmed" onClick={()=>void certificate(detail)}><Download size={16}/>Comprovante de leitura</button>','<span className="mp-confirmed">Leitura registrada</span>'));
fs.writeFileSync('src/lib/notificationNavigation.ts',`import type {CorporateNotification} from '../types';
export function notificationCategory(n:CorporateNotification){return n.targetSection.startsWith('fretes_')?'frete':n.type==='alerta_sla'?'solicitacao':n.type;}
export function notificationRecord(n:CorporateNotification){return n.targetId || (n.publicationId && !n.publicationId.startsWith('queue:')?n.publicationId:undefined);}
export function notificationUrl(n:CorporateNotification, paths:Record<string,string>){const id=notificationRecord(n),path=paths[n.targetSection];return id&&path&&path!=='/'?path+'?registro='+encodeURIComponent(id):null;}
export function notificationMatches(n:CorporateNotification,filter:string){return filter==='todas'||(filter==='nao_lidas'?!n.read:notificationCategory(n)===filter);}
export function orderedNotifications(rows:CorporateNotification[],userId:string){const seen=new Set<string>();return [...rows].filter(n=>!n.recipientId||n.recipientId===userId).sort((a,b)=>(Date.parse(b.createdAtIso||'')||0)-(Date.parse(a.createdAtIso||'')||0)||b.id.localeCompare(a.id)).filter(n=>{const key=(n.recipientId||userId)+':'+n.type+':'+(n.publicationId||n.id);if(seen.has(key))return false;seen.add(key);return true;});}
`);
fs.writeFileSync('src/hooks/useNotificationRecord.ts',`import {useEffect,useState} from 'react';
const read=()=>new URLSearchParams(window.location.search).get('registro');
export function useNotificationRecord(){const [id,setId]=useState(read);useEffect(()=>{const update=()=>setId(read());window.addEventListener('rodovar:record',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('rodovar:record',update);window.removeEventListener('popstate',update);};},[]);return id;}
`);
edit('src/components/MuralPremium.tsx',s=>"import {useNotificationRecord} from '../hooks/useNotificationRecord';\n"+s.replace(' const detail=rows.find'," const notificationRecordId=useNotificationRecord();\n useEffect(()=>{if(notificationRecordId&&rows.some(a=>a.id===notificationRecordId)){setSelected(notificationRecordId);setDetailTab('Comunicado');}},[notificationRecordId,rows.length]);\n const detail=rows.find"));
edit('src/components/SharedRequestsView.tsx',s=>"import {useNotificationRecord} from '../hooks/useNotificationRecord';\n"+s.replace('  const selected = rows.find',"  const notificationRecordId=useNotificationRecord();\n  useEffect(()=>{if(notificationRecordId&&rows.some(r=>r.id===notificationRecordId))setSelectedId(notificationRecordId);},[notificationRecordId,rows.length]);\n  const selected = rows.find"));
edit('src/components/ModulesView.tsx',s=>"import {useNotificationRecord} from '../hooks/useNotificationRecord';\n"+s.replace('useCallback, useMemo, useState','useCallback, useMemo, useState, useEffect').replace('  const [inspectAttendeesEvent,', '  const [inspectAttendeesEvent,').replace("  const [inspectAttendeesEvent, setInspectAttendeesEvent] = useState<CorporateEvent | null>(null);","  const [inspectAttendeesEvent, setInspectAttendeesEvent] = useState<CorporateEvent | null>(null);\n  const notificationRecordId=useNotificationRecord();\n  useEffect(()=>{if(activeSection==='agenda'&&notificationRecordId){const match=events.find(e=>e.id===notificationRecordId);if(match)setInspectAttendeesEvent(match);}},[activeSection,notificationRecordId,events]);").replace('Lista de Presença — {inspectAttendeesEvent.title}','Detalhes do Evento — {inspectAttendeesEvent.title}').replace('<span className="font-bold text-[#15191D]">\n                  Confirmados:', '<span className="font-bold text-[#15191D]">\n                  Confirmados:').replace('{inspectAttendeesEvent.day} {inspectAttendeesEvent.monthShort}', '{inspectAttendeesEvent.description}<br/>{inspectAttendeesEvent.day} {inspectAttendeesEvent.monthShort}'));
edit('src/App.tsx',s=>{
s="import {notificationUrl,notificationRecord,notificationMatches,orderedNotifications} from './lib/notificationNavigation';\nimport './components/NotificationsClean.css';\n"+s;
s=s.replace(/  const sortedUniqueNotifications = \(\(\) => \{[\s\S]*?\n  \}\)\(\);/,"  const sortedUniqueNotifications = orderedNotifications(notifications,currentUser.id).filter(n=>hasPagePermission(currentUser,n.targetSection));");
const marker='  const handleDeleteNotification = async';
s=s.replace(marker,`  const handleAccessNotification = (n:CorporateNotification) => {
    const url=notificationUrl(n,SECTION_TO_PATH);
    if(!url || !hasPagePermission(currentUser,n.targetSection)){setNotificationNavigationError('Este aviso não possui um registro acessível vinculado.');return;}
    setNotificationNavigationError('');
    void handleMarkNotificationRead(n.id);
    window.history.pushState({section:n.targetSection},'',url);
    if(n.targetSection.startsWith('fretes_'))setSelectedNotificationFreightId(notificationRecord(n)||null);
    setActiveSection(n.targetSection);
    window.dispatchEvent(new Event('rodovar:record'));
    setShowNotificationsPopover(false);setShowNotificationsCenterModal(false);
  };
`+marker);
s=s.replace('  const [selectedNotificationFreightId,',"  const [notificationNavigationError,setNotificationNavigationError]=useState('');\n  const [selectedNotificationFreightId,");
s=s.replace('setSelectedNotificationFreightId] = useState<string | null>(\n    null','setSelectedNotificationFreightId] = useState<string | null>(\n    new URLSearchParams(window.location.search).get(\'registro\')');
// All four existing notice entry points share the same guarded record navigation.
s=s.replace(/handleMarkNotificationRead\((n|notif)\.id\);\s*if \([\s\S]*?setActiveSection\(\1.targetSection\);(?:\s*setShowNotifications(?:Popover|CenterModal)\(false\);)?/g,(_,name)=>`handleAccessNotification(${name});`);
s=s.replace("{ id: 'mensagem', label: 'Mensagens' },","{ id: 'frete', label: 'Fretes' },");
s=s.replace('Alertas corporativos em tempo real, fretes operacionais, comunicados, SLA 48h e mensagens','Comunicados, eventos, solicitações e atualizações operacionais');
s=s.replace(/\.filter\(\(n\) => \{\s*if \(notifCenterFilter === 'todas'\)[\s\S]*?return n.type === notifCenterFilter;\s*\}\)/,".filter(n => notificationMatches(n,notifCenterFilter))");
s=s.replace('className="absolute right-0 mt-2 w-88','className="nc-popover absolute right-0 mt-2 w-88');
s=s.replace('className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col"','role="dialog" aria-modal="true" aria-label="Central de Notificações" className="nc-center bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col"');
s=s.replace('className="w-full py-2.5 px-1.5 flex', 'data-unread={!n.read} className="nc-notice w-full py-2.5 px-1.5 flex');
s=s.replace('className="py-3 px-3 flex items-center justify-between', 'data-unread={!n.read} className="nc-notice py-3 px-3 flex items-center justify-between');
s=s.replace('            {/* Notifications List */}', '            {notificationNavigationError&&<p role="alert" className="nc-error">{notificationNavigationError}</p>}\n            {/* Notifications List */}');
s=s.replace('                    <div className="divide-y divide-gray-100 max-h-72', '                    {notificationNavigationError&&<p role="alert" className="nc-error">{notificationNavigationError}</p>}\n                    <div className="divide-y divide-gray-100 max-h-72');
s=s.replace("await Promise.all(notifications.filter(n=>n.id.startsWith('queue:')", "await Promise.all(notifications.filter(n=>n.id.startsWith('fnotif-')&&!n.read).map(n=>apiMarkFreightNotificationRead(n.id)));\n    await Promise.all(notifications.filter(n=>n.id.startsWith('queue:')");
return s;});
edit('src/main.tsx',s=>s.replace("typeof window !== 'undefined' && 'serviceWorker' in navigator","typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator"));
edit('src/hooks/usePWA.ts',s=>s.replace('        setIsInstalled(true);',"        // Installation completes only when appinstalled or standalone is observed.").replace('          window.__rodovarAppInstalled = true;', '          // Keep waiting for the browser appinstalled event.'));
edit('src/components/PWAInstallModal.tsx',s=>s.replace('              {isInIframe && (',`              {!window.isSecureContext&&<div role="note" className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-sm"><strong>Instalação PWA indisponível neste endereço HTTP da rede.</strong><p>Chrome e Edge exigem HTTPS para instalar este portal como PWA na rede local. Neste computador, use http://localhost:3000. Nos demais dispositivos, utilize o portal no navegador até que um endereço HTTPS confiável seja configurado. Se o menu do navegador oferecer um atalho, ele não garante os recursos de instalação PWA.</p></div>}
              {isInIframe && (`));
