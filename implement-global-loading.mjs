import fs from 'node:fs';
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));
edit('index.html',s=>s.replace('<html lang="pt-BR">','<html lang="pt-BR" data-portal-loading="true">').replace('    <title>',`    <link rel="stylesheet" href="/portal-loading.css" />
    <link rel="preload" as="image" href="/assets/loading/mascote.png" />
    <link rel="preload" as="image" href="/assets/loading/logo.png" />
    <title>`).replace('    <div id="root"></div>',`    <div id="portal-loading" role="status" aria-live="polite" aria-label="Preparando seu ambiente...">
      <div class="portal-loading-content">
        <img class="portal-loading-mascot" src="/assets/loading/mascote.png" alt="Mascote oficial Rodovar" width="520" height="466" fetchpriority="high" />
        <img class="portal-loading-logo" src="/assets/loading/logo.png" alt="Rodovar — Sua carga em primeiro lugar" width="4000" height="1650" />
        <p>Preparando seu ambiente...</p>
        <div class="portal-loading-track" aria-hidden="true"><span></span></div>
      </div>
    </div>
    <noscript><style>#portal-loading{display:none}</style><p>Ative o JavaScript para utilizar o RODOVAR CONECTA.</p></noscript>
    <div id="root"></div>`));
edit('src/main.tsx',s=>"import {GlobalLoading} from './components/GlobalLoading';\n"+s.replace('.render(<App />)','.render(<><GlobalLoading /><App /></>)'));
edit('src/App.tsx',s=>"import {usePortalInitialized} from './components/GlobalLoading';\n"+s.replace("  const [authReady, setAuthReady]", "  const [portalInitialized,setPortalInitialized]=useState(false);\n  usePortalInitialized(portalInitialized);\n  const [authReady, setAuthReady]").replace("console.debug('Server session check info:', err);\n      }", "console.debug('Server session check info:', err);\n      } finally {\n        if(mounted)setPortalInitialized(true);\n      }"));
const integrations=[
['src/components/MuralPremium.tsx'," const [editing,setEditing]",'loading && rows.length === 0'],
['src/components/SharedRequestsView.tsx','  const selected = rows.find','loading && rows.length === 0'],
['src/components/ExternalRhView.tsx','  const load=async','loading && rows.length === 0'],
['src/components/MeusFretesComercialView.tsx','  const [loading, setLoading] = useState(true);','loading && freights.length === 0'],
['src/components/MeusFretesExpedicaoView.tsx','  const [loading, setLoading] = useState<boolean>(true);','loading && freights.length === 0'],
['src/components/FretesAtivosView.tsx','  const [loading, setLoading] = useState<boolean>(true);','loading && freights.length === 0']];
for(const [p,marker,active] of integrations)edit(p,s=>{if(!s.includes(marker))throw Error('Marker missing '+p);const statement='useGlobalLoading('+active+');';return "import {useGlobalLoading} from './GlobalLoading';\n"+s.replace(marker,marker.includes('const [loading')?marker+'\n  '+statement:' '+statement+'\n'+marker);});
