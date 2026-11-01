import fs from 'node:fs';
let p='src/components/MeusFretesComercialView.tsx',s=fs.readFileSync(p,'utf8');s=s.replace('  useGlobalLoading(loading && freights.length === 0);\n','').replace('  const [items, setItems] = useState<UnifiedFreightRecord[]>([]);','  const [items, setItems] = useState<UnifiedFreightRecord[]>([]);\n  useGlobalLoading(loading && items.length === 0);');fs.writeFileSync(p,s);
p='src/components/GlobalLoading.tsx';s=fs.readFileSync(p,'utf8').replace('useLayoutEffect, useSyncExternalStore','useLayoutEffect, useSyncExternalStore, useRef').replace('  useLayoutEffect(() => active ? portalLoading.begin() : undefined, [active]);',`  const initialLoadComplete = useRef(false);
  useLayoutEffect(() => {
    if (!active) { initialLoadComplete.current = true; return; }
    if (!initialLoadComplete.current) return portalLoading.begin();
  }, [active]);`);fs.writeFileSync(p,s);
