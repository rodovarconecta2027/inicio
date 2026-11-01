import {compareRecent} from './activityOrder';
import type {CorporateNotification} from '../types';
export function notificationCategory(n:CorporateNotification){return n.targetSection.startsWith('fretes_')?'frete':n.type==='alerta_sla'?'solicitacao':n.type;}
export function notificationRecord(n:CorporateNotification){return n.targetId || (n.publicationId && !n.publicationId.startsWith('queue:')?n.publicationId:undefined);}
export function notificationUrl(n:CorporateNotification, paths:Record<string,string>){const id=notificationRecord(n),path=paths[n.targetSection];return id&&path&&path!=='/'?path+'?registro='+encodeURIComponent(id):null;}
export function notificationMatches(n:CorporateNotification,filter:string){return filter==='todas'||(filter==='nao_lidas'?!n.read:notificationCategory(n)===filter);}
export function orderedNotifications(rows:CorporateNotification[],userId:string){const seen=new Set<string>();return [...rows].filter(n=>!n.recipientId||n.recipientId===userId).sort((a,b)=>compareRecent(a,b)||b.id.localeCompare(a.id)).filter(n=>{const key=(n.recipientId||userId)+':'+n.type+':'+(n.publicationId||n.id);if(seen.has(key))return false;seen.add(key);return true;});}
