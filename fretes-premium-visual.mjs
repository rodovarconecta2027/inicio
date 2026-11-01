import fs from 'node:fs';
const p='src/components/FretesAtivosView.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("import './FretesAtivosView.css';","import './FretesAtivosView.css';\nimport './FretesAtivosPremiumPanel.css';");
s=s.replace('    <div className="fa-card-top">',`    <div className="fa-card-image"><img src="/assets/banner-rodovar-truck.jpg" alt="" width="500" height="255" loading="lazy" decoding="async"/><span>Imagem institucional Rodovar</span></div>
    <div className="fa-card-top">`);
s=s.replace('<p className="fa-route"><span>{f.origemCidadeUf}</span><ArrowRight size={11} aria-label="para" /><span>{f.destinoCidadeUf}</span></p>','');
s=s.replace('<span className="fa-truck-art" aria-hidden="true"><Truck size={32} strokeWidth={1.3} /></span>','');
s=s.replace('    <div className="fa-data-grid">',`    <div className="fa-card-route"><div><span className="fa-route-point" aria-hidden="true"/><div><span className="fa-label">Origem</span><strong>{f.origemCidadeUf}</strong></div></div><div><span className="fa-route-point fa-route-point--destination" aria-hidden="true"/><div><span className="fa-label">Destino</span><strong>{f.destinoCidadeUf}</strong></div></div></div>
    <div className="fa-data-grid">`);
const start=s.indexOf('            {/* 7-Stage Stepper Progress Bar */}');const end=s.indexOf('            {/* Tabs */}',start);if(start<0||end<0)throw Error('Timeline não localizada');s=s.slice(0,start)+s.slice(end);
const timeline=`              <section className="fa-stage-progress" aria-label="Etapas do monitoramento">
                <p>Etapas do monitoramento</p>
                <ol className="fa-stage-timeline">
                  {MONITORING_STAGES_ORDER.map((st, idx) => {
                    const currentIdx = MONITORING_STAGES_ORDER.findIndex(s => s.id === selectedFreight.situacaoMonitoramento);
                    const isCurrent = st.id === selectedFreight.situacaoMonitoramento;
                    const isDone = currentIdx > idx;
                    return <li key={st.id} data-state={isCurrent ? 'current' : isDone ? 'done' : 'pending'} aria-current={isCurrent ? 'step' : undefined}><span className="fa-stage-number" aria-hidden="true">{isDone ? <Check size={14}/> : idx + 1}</span><span>{st.label}</span></li>;
                  })}
                </ol>
              </section>
`;
s=s.replace('<div className="fa-detail-body space-y-4">','<div id="active-freight-content" className="fa-detail-body space-y-4">\n'+timeline);
s=s.replace('<div className="fa-detail-tabs">','<div className="fa-detail-tabs" role="group" aria-label="Seções dos detalhes do frete">');
s=s.replace('onClick={() => setActiveTab(tab.id as typeof activeTab)}','aria-pressed={activeTab === tab.id}\n                  aria-controls="active-freight-content"\n                  onClick={() => setActiveTab(tab.id as typeof activeTab)}');
s=s.replace('className="bg-[#FFFDF0] border-2 border-[#FFD400] rounded-2xl p-3.5 space-y-3"','className="fa-monitoring-form bg-[#FFFDF0] border-2 border-[#FFD400] rounded-2xl p-3.5 space-y-3"');
// Associate existing labels with their existing controls without altering handlers or values.
const associations=[['Nova Etapa *','select','targetNextStage','fa-next-stage'],['Horário Real do Evento (informado)','input','realEventTimeInput','fa-real-event'],['Localização Informada pelo Motorista (sem simulação de GPS)','input','informedLocationInput','fa-location'],['Previsão Atualizada de Entrega','input','previsaoEntregaInput','fa-expected-delivery'],['Observação da Etapa','input','stageObservationInput','fa-stage-note'],['Contatos e Orientações Passadas ao Motorista','textarea','driverInstructionsInput','fa-driver-guidance']];
for(const [label,tag,value,id] of associations){const pos=s.indexOf(label);const labelStart=s.lastIndexOf('<label',pos);if(pos<0||labelStart<0)throw Error('Label ausente '+label);s=s.slice(0,labelStart)+s.slice(labelStart).replace('<label','<label htmlFor="'+id+'"');const valuePos=s.indexOf('value={'+value+'}');const controlStart=s.lastIndexOf('<'+tag,valuePos);s=s.slice(0,controlStart)+s.slice(controlStart).replace('<'+tag,'<'+tag+' id="'+id+'"');}
fs.writeFileSync(p,s);
