import {Employee} from '../types';
import {hasPagePermission,canViewFreightTeam} from './permissions';
export function homeSources(user:Employee):[string,string][]{
 const can=(s:string)=>hasPagePermission(user,s);const sources:[string,string][]=[];
 if(can('comunicados'))sources.push(['mural','/api/mural']);
 if(can('agenda'))sources.push(['agenda','/api/agenda']);
 if(can('solicitacoes'))sources.push(['requests','/api/requests']);
 if(can('fretes_ativos'))sources.push(['freights','/api/meus-fretes?area=MONITORAMENTO&scope='+(canViewFreightTeam(user)?'EQUIPE':'MEUS')+'&limit=50']);
 if(can('financeiro')&&(user.accessLevel==='ADMINISTRADOR'||user.accessProfile==='DIRETORIA'||user.accessProfile==='FINANCEIRO'))sources.push(['finance','/api/pagamentos/fretes']);
 if(can('administracao'))sources.push(['drivers','/api/drivers']);
 return sources;
}
export const bahiaToday=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function upcomingHomeEvents(events:any[],today=bahiaToday()){return events.filter(e=>!e.cancelled&&e.dateIso>=today).sort((a,b)=>(a.dateIso+(a.start||'')).localeCompare(b.dateIso+(b.start||''))).slice(0,3);}
