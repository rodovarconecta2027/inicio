import fs from 'node:fs';
import ts from 'typescript';
const files=['src/components/ModulesView.tsx','src/components/FinanceiroFretesView.tsx','src/components/FreightOrderDetailsModal.tsx','src/components/SharedRequestsView.tsx'];
const backup='restore-points/attendance-print-'+Date.now();fs.mkdirSync(backup,{recursive:true});
for(const p of files){let s=fs.readFileSync(p,'utf8');fs.writeFileSync(backup+'/'+p.split('/').pop()+'.bak',s);let count=0;s=s.replace(/<button\b[\s\S]*?<\/button>/g,button=>{if(/imprimir|window\.print\(/i.test(button)){count++;return '';}return button;});const removals=Array(count);fs.writeFileSync(p,s);console.log(p+': '+removals.length+' botões de impressão removidos');}
let s=fs.readFileSync(files[0],'utf8');s=s.replace('Ver confirmados ({evt.attendees.length})',"{canPublish ? `Ver confirmados (${evt.attendees.length})` : 'Ver detalhes'}");s=s.replace('`Confirmados: ${evt.attendees.length} colaborador(es)`,',"...(canPublish ? [`Confirmados: ${evt.attendees.length} colaborador(es)`] : []),");
const start=s.indexOf('<div className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-[#F3F5F7] p-2.5 rounded-xl border border-gray-200 text-xs">',s.indexOf('{inspectAttendeesEvent && ('));
const end=s.indexOf('\n            </div>\n          </div>\n        )}',start);
if(start<0||end<0)throw Error('Modal não localizado');s=s.slice(0,start)+'{canPublish && <>'+s.slice(start,end)+'</>}'+s.slice(end);fs.writeFileSync(files[0],s);console.log('Restauração: '+backup);
