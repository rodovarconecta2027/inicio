import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationUrl,notificationRecord,notificationMatches,orderedNotifications} from '../src/lib/notificationNavigation';
import type {CorporateNotification} from '../src/types';
const paths={comunicados:'/comunicados',agenda:'/agenda',solicitacoes:'/solicitacoes',fretes_ativos:'/fretes-ativos',inicio:'/'};
const base:CorporateNotification={id:'notice',type:'comunicado',dotColor:'blue',title:'Comunicado',subtitle:'',timeLabel:'Hoje',read:false,targetSection:'comunicados',targetId:'ann-1',createdAtIso:'2026-10-31T12:00:00Z'};
test('notificações: links identificam comunicado, evento, solicitação e frete sem redirecionar ao início',()=>{
 for(const [section,id] of [['comunicados','ann-1'],['agenda','evt-2'],['solicitacoes','req-1025'],['fretes_ativos','freight-3']] as const){const n={...base,targetSection:section,targetId:id};const url=notificationUrl(n,paths);assert.ok(url);const refreshed=new URL(url!,'http://localhost:3000');assert.equal(refreshed.searchParams.get('registro'),id);assert.equal(refreshed.pathname,paths[section]);}
 assert.equal(notificationUrl({...base,targetSection:'inicio'},paths),null);
 assert.equal(notificationUrl({...base,targetId:undefined,publicationId:undefined},paths),null);
 assert.equal(notificationRecord({...base,targetId:undefined,publicationId:'ann-4'}),'ann-4');
 assert.equal(notificationUrl({...base,targetId:'id com / e ?'},paths),'/comunicados?registro=id%20com%20%2F%20e%20%3F');
});
test('notificações: filtros, destinatário, contagem não lida e ordem preservam eventos diferentes do mesmo registro',()=>{
 const rows=[base,{...base,id:'later',publicationId:'update-2',createdAtIso:'2026-10-31T14:00:00Z',read:true},{...base,id:'other',recipientId:'other-user'},{...base}];
 const ordered=orderedNotifications(rows,'me');assert.deepEqual(ordered.map(n=>n.id),['later','notice']);assert.equal(ordered.filter(n=>notificationMatches(n,'nao_lidas')).length,1);
 assert.equal(notificationMatches({...base,type:'alerta_sla'},'solicitacao'),true);assert.equal(notificationMatches({...base,targetSection:'fretes_ativos'},'frete'),true);assert.equal(notificationMatches(base,'evento'),false);
 assert.equal(ordered.map(n=>({...n,read:true})).filter(n=>notificationMatches(n,'nao_lidas')).length,0);
});
