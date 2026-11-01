import React,{useState} from 'react';
import type {Employee} from '../types';
import {hasPagePermission} from '../lib/permissions';
import {SharedRequestsView} from './SharedRequestsView';
import {ExternalRhView} from './ExternalRhView';
import './ExternalRh.css';
export function RhRequestsWorkspace(props:{currentUser:Employee;initialOpenRequestModal?:boolean;onClearInitialModal?:()=>void}){
  const [external,setExternal]=useState(false);
  const allowed=props.currentUser.accessProfile==='RH'&&hasPagePermission(props.currentUser,'solicitacoes');
  return <>{allowed&&<div className="rh-ext-tabs mb-5" aria-label="Áreas da Central de Solicitações"><button aria-pressed={!external} onClick={()=>setExternal(false)}>Solicitações internas</button><button aria-pressed={external} onClick={()=>setExternal(true)}>Atendimento Externo — RH</button></div>}{allowed&&external?<ExternalRhView/>:<SharedRequestsView {...props}/>}</>;
}
