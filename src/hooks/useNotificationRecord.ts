import {useEffect,useState} from 'react';
const read=()=>new URLSearchParams(window.location.search).get('registro');
export function useNotificationRecord(){const [record,setRecord]=useState(()=>({id:read(),revision:0}));useEffect(()=>{const update=()=>setRecord(prev=>({id:read(),revision:prev.revision+1}));window.addEventListener('rodovar:record',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('rodovar:record',update);window.removeEventListener('popstate',update);};},[]);return record;}
