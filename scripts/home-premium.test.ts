import test from 'node:test';import assert from 'node:assert/strict';import {homeSources,bahiaToday,upcomingHomeEvents} from '../src/lib/homeData';import {compareRecent} from '../src/lib/activityOrder';
const user=(profile:string):any=>({id:'u',active:true,approvalStatus:'APROVADO',accessLevel:'FUNCIONARIO',accessProfile:profile});
test('Home consulta somente serviços autorizados, sem indicadores financeiros ou motoristas para funcionários',()=>{
 for(const profile of ['COMERCIAL','EXPEDICAO','MONITORAMENTO','RH']){const sources=homeSources(user(profile));assert.ok(!sources.some(([key])=>key==='finance'||key==='drivers'));}
 assert.ok(homeSources(user('FINANCEIRO')).some(([key])=>key==='finance'));
 assert.ok(homeSources(user('DIRETORIA')).some(([key])=>key==='finance'));
 const manager={...user('MONITORAMENTO'),accessProfile:undefined,roleTitle:'Gerente de Logística',department:'Logística'};assert.ok(homeSources(manager).find(([key])=>key==='freights')?.[1].includes('scope=MEUS'));
 assert.equal(homeSources({...user('RH'),active:false}).length,0);
});
test('Home ordena eventos, exclui cancelados e passados; datas preservadas no fuso Bahia',()=>{
 assert.equal(bahiaToday(new Date('2026-11-02T01:00:00Z')),'2026-11-01');
 const source=[{id:'later',dateIso:'2027-12-01',start:'10:00'},{id:'past',dateIso:'2025-01-01'},{id:'first',dateIso:'2026-11-02',start:'09:00'},{id:'cancel',dateIso:'2026-11-01',cancelled:true}];
 assert.deepEqual(upcomingHomeEvents(source,'2026-11-01').map(e=>e.id),['first','later']);assert.equal(source[0].dateIso,'2027-12-01');
 const posts=[{createdAtIso:'2026-10-01T10:00:00Z'},{createdAtIso:'2026-10-30T10:00:00Z'}].sort(compareRecent);assert.equal(posts[0].createdAtIso,'2026-10-30T10:00:00Z');
});
