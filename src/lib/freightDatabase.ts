import { FreightDocumentFile, FreightRecord } from '../types';

const STORAGE_KEY = 'rodovar_conecta_fretes_financeiro_v1';
const IDB_NAME = 'rodovar_financeiro_files_db';
const IDB_STORE = 'freight_files';
const IDB_VERSION = 1;

export const INITIAL_FREIGHTS: FreightRecord[] = [
  {
    id: 'frete-0842',
    code: '#0842',
    createdAtDate: '26/10/2026',
    createdAtIso: '2026-10-26T09:30:00.000Z',
    empresaMarca: 'RODOVAR',
    dataCarregamento: '26/10/2026',
    unidadeOperacional: 'BA - Salvador',
    comercialResponsavel: 'Jeise / César',
    expedicaoResponsavel: 'Marcos Silva',
    cliente: 'AMBEV S.A.',
    telefoneCliente: '71 9 9920-2476',
    motoristaNome: 'José Carlos Pereira dos Santos',
    motoristaTelefone: '71 9 8845-1290',
    emergenciaNome: 'Maria Helena (Esposa)',
    emergenciaTelefone: '71 9 9123-4567',
    origem: 'FEIRA DE SANTANA-BA - CD AMBEV',
    destino: 'SALVADOR-BA - GALPÃO RODOVAR',
    dataColeta: '26/10',
    dataEntrega: '27/10',
    valorFreteEmpresa: 8900,
    valorFreteMotorista: 6000,
    regraTipo: '70_30',
    regraLabel: '70% / 30%',
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 6000,
    valorAdiantamento: 4200,
    valorSaldo: 1800,
    favorecido: 'João Silva Transportes',
    banco: '260 - Nu Pagamentos',
    agencia: '0001',
    conta: '18670000-5',
    tipoChavePix: 'CPF/CNPJ',
    chavePix: '097.813.375-00',
    status: 'Pendente Adiantamento',
    adiantamentoPago: false,
    entregaConfirmada: false,
    saldoPago: false,
    solicitanteNome: 'Carlos Mendes (Operação Matriz)',
    docs: {
      cte: {
        id: 'doc-cte-0842',
        type: 'CT-e',
        label: 'CT-e',
        fileName: 'CTe_3526100842_AMBEV.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '248 KB',
        uploadedAt: '26/10/2026 09:28',
        uploadedBy: 'Carlos Mendes',
      },
      mdfe: {
        id: 'doc-mdfe-0842',
        type: 'MDF-e',
        label: 'MDF-e',
        fileName: 'MDFe_Manifesto_0842_BA.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '192 KB',
        uploadedAt: '26/10/2026 09:29',
        uploadedBy: 'Carlos Mendes',
      },
      rpa: {
        id: 'doc-rpa-0842',
        type: 'RPA',
        label: 'RPA',
        fileName: 'RPA_Recibo_Autonomo_0842.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '164 KB',
        uploadedAt: '26/10/2026 09:30',
        uploadedBy: 'Carlos Mendes',
      },
    },
  },
  {
    id: 'frete-0841',
    code: '#0841',
    createdAtDate: '25/10/2026',
    createdAtIso: '2026-10-25T14:15:00.000Z',
    empresaMarca: 'VL TRANSPORTES',
    dataCarregamento: '25/10/2026',
    unidadeOperacional: 'SP - Guarulhos',
    comercialResponsavel: 'César Augusto',
    expedicaoResponsavel: 'Fernanda Lima',
    cliente: 'BAHIA SUL LOG.',
    telefoneCliente: '11 9 9812-3340',
    motoristaNome: 'Antônio Marcos Rocha',
    motoristaTelefone: '77 9 9914-8821',
    emergenciaNome: 'Roberto Rocha (Irmão)',
    emergenciaTelefone: '77 9 8832-1044',
    origem: 'VITÓRIA DA CONQUISTA-BA - TERMINAL SUL',
    destino: 'GUARULHOS-SP - CD LOGÍSTICO',
    dataColeta: '25/10',
    dataEntrega: '29/10',
    valorFreteEmpresa: 12400,
    valorFreteMotorista: 8500,
    regraTipo: '70_30',
    regraLabel: '70% / 30%',
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 8500,
    valorAdiantamento: 5950,
    valorSaldo: 2550,
    favorecido: 'TransBahia Cargas Rodoviárias Ltda',
    banco: '341 - Itaú Unibanco',
    agencia: '1402',
    conta: '44890-2',
    tipoChavePix: 'CPF/CNPJ',
    chavePix: '14.528.901/0001-88',
    status: 'Pendente Saldo',
    adiantamentoPago: true,
    adiantamentoPagoEm: '25/10/2026 15:40',
    adiantamentoVerificacaoStatus: 'PAGAMENTO_CONFIRMADO',
    codigoTransacaoAdiantamento: 'E34100982202610251540PIX',
    entregaConfirmada: true,
    entregaConfirmadaEm: '26/10/2026 11:10',
    saldoPago: false,
    saldoVerificacaoStatus: 'SEM_COMPROVANTE',
    solicitanteNome: 'Fernanda Lima (Logística)',
    docs: {
      cte: {
        id: 'doc-cte-0841',
        type: 'CT-e',
        label: 'CT-e',
        fileName: 'CTe_3526100841_BAHIASUL.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '310 KB',
        uploadedAt: '25/10/2026 14:10',
        uploadedBy: 'Fernanda Lima',
      },
      mdfe: {
        id: 'doc-mdfe-0841',
        type: 'MDF-e',
        label: 'MDF-e',
        fileName: 'MDFe_Manifesto_0841_SP.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '215 KB',
        uploadedAt: '25/10/2026 14:12',
        uploadedBy: 'Fernanda Lima',
      },
      rpa: {
        id: 'doc-rpa-0841',
        type: 'RPA',
        label: 'RPA',
        fileName: 'RPA_Contrato_Frete_0841.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '178 KB',
        uploadedAt: '25/10/2026 14:14',
        uploadedBy: 'Fernanda Lima',
      },
      comprovanteAdiantamento: {
        id: 'doc-comp-adiant-0841',
        type: 'COMPROVANTE_ADIANTAMENTO',
        label: 'Comprovante de Adiantamento',
        fileName: 'Comprovante_Adiantamento_0841.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '142 KB',
        uploadedAt: '25/10/2026 15:40',
        uploadedBy: 'Financeiro RODOVAR',
      },
    },
  },
  {
    id: 'frete-0840',
    code: '#0840',
    createdAtDate: '24/10/2026',
    createdAtIso: '2026-10-24T11:20:00.000Z',
    empresaMarca: 'AXD',
    dataCarregamento: '24/10/2026',
    unidadeOperacional: 'BA - Salvador',
    comercialResponsavel: 'Jeise Santana',
    expedicaoResponsavel: 'Carlos Mendes',
    cliente: 'BRASKEM S.A.',
    telefoneCliente: '71 3496-8000',
    motoristaNome: 'Marcos Oliveira da Silva',
    motoristaTelefone: '71 9 8711-4402',
    emergenciaNome: 'Luciana Oliveira (Esposa)',
    emergenciaTelefone: '71 9 9201-7755',
    origem: 'CAMAÇARI-BA - POLO PETROQUÍMICO',
    destino: 'RECIFE-PE - DISTRITO INDUSTRIAL',
    dataColeta: '24/10',
    dataEntrega: '28/10',
    valorFreteEmpresa: 16800,
    valorFreteMotorista: 12000,
    regraTipo: '70_30',
    regraLabel: '70% / 30%',
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 12000,
    valorAdiantamento: 8400,
    valorSaldo: 3600,
    favorecido: 'Marcos Oliveira Transportes ME',
    banco: '001 - Banco do Brasil',
    agencia: '3142-X',
    conta: '99210-4',
    tipoChavePix: 'CPF/CNPJ',
    chavePix: '28.901.442/0001-19',
    status: 'Aguardando Entrega',
    adiantamentoPago: true,
    adiantamentoPagoEm: '24/10/2026 13:05',
    codigoTransacaoAdiantamento: 'E00100441202610241305PIX',
    entregaConfirmada: false,
    saldoPago: false,
    solicitanteNome: 'Carlos Mendes (Operação Matriz)',
    docs: {
      cte: {
        id: 'doc-cte-0840',
        type: 'CT-e',
        label: 'CT-e',
        fileName: 'CTe_3526100840_BRASKEM.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '285 KB',
        uploadedAt: '24/10/2026 11:18',
        uploadedBy: 'Carlos Mendes',
      },
      mdfe: {
        id: 'doc-mdfe-0840',
        type: 'MDF-e',
        label: 'MDF-e',
        fileName: 'MDFe_Manifesto_0840_PE.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '198 KB',
        uploadedAt: '24/10/2026 11:19',
        uploadedBy: 'Carlos Mendes',
      },
      rpa: {
        id: 'doc-rpa-0840',
        type: 'RPA',
        label: 'RPA',
        fileName: 'RPA_Motorista_0840.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '156 KB',
        uploadedAt: '24/10/2026 11:20',
        uploadedBy: 'Carlos Mendes',
      },
      comprovanteAdiantamento: {
        id: 'doc-comp-adiant-0840',
        type: 'COMPROVANTE_ADIANTAMENTO',
        label: 'Comprovante de Adiantamento',
        fileName: 'Comprovante_Adiantamento_0840.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '138 KB',
        uploadedAt: '24/10/2026 13:05',
        uploadedBy: 'Financeiro RODOVAR',
      },
    },
  },
  {
    id: 'frete-0839',
    code: '#0839',
    createdAtDate: '22/10/2026',
    createdAtIso: '2026-10-22T08:45:00.000Z',
    empresaMarca: 'RODOVAR',
    dataCarregamento: '22/10/2026',
    unidadeOperacional: 'SP - Guarulhos',
    comercialResponsavel: 'Jeise / César',
    expedicaoResponsavel: 'Fernanda Lima',
    cliente: 'SUZANO CELULOSE',
    telefoneCliente: '11 3500-9900',
    motoristaNome: 'Ricardo Alves Nascimento',
    motoristaTelefone: '11 9 8412-5560',
    emergenciaNome: 'Patrícia Alves (Esposa)',
    emergenciaTelefone: '11 9 9102-3389',
    origem: 'MUCURI-BA - FÁBRICA SUZANO',
    destino: 'SANTOS-SP - TERMINAL PORTUÁRIO',
    dataColeta: '22/10',
    dataEntrega: '25/10',
    valorFreteEmpresa: 21500,
    valorFreteMotorista: 15400,
    regraTipo: '70_30',
    regraLabel: '70% / 30%',
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 15400,
    valorAdiantamento: 10780,
    valorSaldo: 4620,
    favorecido: 'Expresso Atlântico Cargas Ltda',
    banco: '237 - Bradesco',
    agencia: '0418',
    conta: '77120-9',
    tipoChavePix: 'CPF/CNPJ',
    chavePix: '04.119.882/0001-55',
    status: 'Pago',
    adiantamentoPago: true,
    adiantamentoPagoEm: '22/10/2026 10:15',
    codigoTransacaoAdiantamento: 'E23700811202610221015PIX',
    entregaConfirmada: true,
    entregaConfirmadaEm: '25/10/2026 09:30',
    saldoPago: true,
    saldoPagoEm: '25/10/2026 14:20',
    codigoTransacaoSaldo: 'E23700944202610251420PIX',
    solicitanteNome: 'Fernanda Lima (Logística)',
    docs: {
      cte: {
        id: 'doc-cte-0839',
        type: 'CT-e',
        label: 'CT-e',
        fileName: 'CTe_3526100839_SUZANO.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '324 KB',
        uploadedAt: '22/10/2026 08:40',
        uploadedBy: 'Fernanda Lima',
      },
      mdfe: {
        id: 'doc-mdfe-0839',
        type: 'MDF-e',
        label: 'MDF-e',
        fileName: 'MDFe_Manifesto_0839_SP.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '210 KB',
        uploadedAt: '22/10/2026 08:42',
        uploadedBy: 'Fernanda Lima',
      },
      rpa: {
        id: 'doc-rpa-0839',
        type: 'RPA',
        label: 'RPA',
        fileName: 'RPA_Frete_0839.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '185 KB',
        uploadedAt: '22/10/2026 08:44',
        uploadedBy: 'Fernanda Lima',
      },
      comprovanteAdiantamento: {
        id: 'doc-comp-adiant-0839',
        type: 'COMPROVANTE_ADIANTAMENTO',
        label: 'Comprovante de Adiantamento',
        fileName: 'Comprovante_Adiantamento_0839.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '149 KB',
        uploadedAt: '22/10/2026 10:15',
        uploadedBy: 'Financeiro RODOVAR',
      },
      comprovanteSaldo: {
        id: 'doc-comp-saldo-0839',
        type: 'COMPROVANTE_SALDO',
        label: 'Comprovante de Saldo',
        fileName: 'Comprovante_Saldo_0839.pdf',
        mimeType: 'application/pdf',
        sizeLabel: '152 KB',
        uploadedAt: '25/10/2026 14:20',
        uploadedBy: 'Financeiro RODOVAR',
      },
    },
  },
];

// Open IndexedDB for storing large PDF / Image dataUrls permanently
function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFileDataToIndexedDB(fileId: string, dataUrl: string): Promise<void> {
  try {
    const db = await openFilesDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ id: fileId, dataUrl, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.debug('IndexedDB file save fallback info:', err);
  }
}

export async function getFileDataFromIndexedDB(fileId: string): Promise<string | null> {
  try {
    const db = await openFilesDb();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(fileId);
      req.onsuccess = () => {
        resolve(req.result?.dataUrl || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export function loadFreightsFromStorage(): FreightRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FreightRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.debug('Freight storage load info:', err);
  }
  return INITIAL_FREIGHTS;
}

export function saveFreightsToStorage(freights: FreightRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freights));
  } catch (err) {
    // If localStorage hits quota due to inline dataUrls, strip large dataUrls before saving to localStorage
    // while keeping them safely in IndexedDB
    try {
      const lightweight = freights.map((f) => {
        const cleanDocs: FreightRecord['docs'] = {};
        (Object.keys(f.docs) as Array<keyof FreightRecord['docs']>).forEach((k) => {
          const docItem = f.docs[k];
          if (docItem) {
            if (docItem.dataUrl && docItem.dataUrl.length > 80000) {
              void saveFileDataToIndexedDB(docItem.id, docItem.dataUrl);
              cleanDocs[k] = { ...docItem, dataUrl: undefined };
            } else {
              cleanDocs[k] = docItem;
            }
          }
        });
        return { ...f, docs: cleanDocs };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
    } catch (innerErr) {
      console.debug('Freight storage fallback info:', err, innerErr);
    }
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function createFreightDocumentFile(
  file: File,
  type: FreightDocumentFile['type'],
  label: string,
  uploadedBy: string
): Promise<FreightDocumentFile> {
  const dataUrl = await readFileAsDataUrl(file);
  const id = `fdoc-${type.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await saveFileDataToIndexedDB(id, dataUrl);
  const nowStr = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return {
    id,
    type,
    label,
    fileName: file.name,
    mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
    sizeLabel: formatFileSize(file.size),
    uploadedAt: nowStr,
    uploadedBy,
    dataUrl,
  };
}
