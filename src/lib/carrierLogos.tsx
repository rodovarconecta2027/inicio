import React from 'react';
import { CarrierBrand, OperationalUnit } from '../types';

export const CARRIER_BRANDS: CarrierBrand[] = ['RODOVAR', 'VL TRANSPORTES', 'AXD'];

export const OPERATIONAL_UNITS: { value: OperationalUnit; tag: 'SSA-BA' | 'GRU-SP'; label: string }[] = [
  { value: 'BA - Salvador', tag: 'SSA-BA', label: 'BA - Salvador (SSA-BA)' },
  { value: 'SP - Guarulhos', tag: 'GRU-SP', label: 'SP - Guarulhos (GRU-SP)' },
];

export function getUnitShortTag(unit?: OperationalUnit | string): 'SSA-BA' | 'GRU-SP' {
  if (unit && (unit.includes('SP') || unit.toLowerCase().includes('guarulhos') || unit.includes('GRU'))) {
    return 'GRU-SP';
  }
  return 'SSA-BA';
}

export const CarrierBrandLogo: React.FC<{
  brand?: CarrierBrand;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ brand = 'RODOVAR', size = 'md', className = '' }) => {
  const heightClass =
    size === 'sm' ? 'h-7' : size === 'lg' ? 'h-12' : 'h-9';

  if (brand === 'VL TRANSPORTES') {
    return (
      <div
        className={`inline-flex items-center justify-center bg-white px-2.5 py-1 rounded-lg border border-gray-200/80 shadow-2xs select-none ${heightClass} ${className}`}
        title="VL Transportes"
      >
        <img
          src="/assets/aistudio/image_a37f0512.png"
          alt="VL Transportes"
          className="h-full w-auto object-contain"
        />
      </div>
    );
  }

  if (brand === 'AXD') {
    return (
      <div
        className={`inline-flex items-center justify-center bg-white px-2.5 py-1 rounded-lg border border-gray-200/80 shadow-2xs select-none ${heightClass} ${className}`}
        title="AXD Logística & Transportes"
      >
        <svg
          viewBox="0 0 270 100"
          className="h-full w-auto"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Letter A */}
          <polygon points="42,10 64,10 96,90 72,90 65,70 35,70 43,52 59,52 52,32 32,90 10,90" fill="#1E293B" />
          {/* Orange bottom-left leg of A */}
          <polygon points="23,55 44,55 31,90 10,90" fill="#F97316" />

          {/* Diamond Dot between A and X */}
          <polygon points="105,53 116,64 105,75 94,64" fill="#1E293B" />

          {/* Letter X main diagonal (top-left to bottom-right) */}
          <polygon points="88,10 114,10 176,90 150,90" fill="#1E293B" />
          {/* Orange top-right arm of X */}
          <polygon points="156,10 180,10 148,44 135,31" fill="#F97316" />
          {/* Orange bottom-right tip of X */}
          <polygon points="154,72 167,72 180,90 154,90" fill="#F97316" />

          {/* Letter D */}
          <path
            d="M188,10 H226 C250,10 264,28 264,50 C264,72 250,90 226,90 H188 V10 Z M210,28 V72 H224 C237,72 244,63 244,50 C244,37 237,28 224,28 H210 Z"
            fill="#334155"
          />
          {/* Orange bottom curve of D */}
          <path
            d="M210,72 H225 C236,72 242,65 244,56 H263 C260,76 246,90 225,90 H196 L210,72 Z"
            fill="#F97316"
          />
        </svg>
      </div>
    );
  }

  // Default: RODOVAR
  return (
    <div
      className={`inline-flex items-center justify-center bg-white px-2.5 py-1 rounded-lg border border-gray-200/80 shadow-2xs select-none ${heightClass} ${className}`}
      title="Transportadora RODOVAR"
    >
      <img
        src="/assets/aistudio/RODOVAR-LOGO_310056c8.png"
        alt="RODOVAR"
        className="h-full w-auto object-contain"
      />
    </div>
  );
};

// Render carrier logo to PNG DataURL for jsPDF A4 Order of Loading
export async function getCarrierLogoPngDataUrl(brand: CarrierBrand = 'RODOVAR'): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (brand === 'RODOVAR') {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = '/assets/aistudio/RODOVAR-LOGO_310056c8.png';
      });
      if (loaded) {
        ctx.drawImage(img, 20, 15, 520, 150);
        return canvas.toDataURL('image/png');
      }
    } catch {
      // Fallback to vector drawing
    }
    ctx.font = 'italic 900 84px Arial Black, sans-serif';
    ctx.fillStyle = '#F5B800';
    ctx.fillText('RODO', 30, 120);
    ctx.fillStyle = '#080B0D';
    ctx.fillText('VAR', 295, 120);
    return canvas.toDataURL('image/png');
  }

  if (brand === 'VL TRANSPORTES') {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = '/assets/aistudio/image_a37f0512.png';
      });
      if (loaded) {
        const scale = Math.min((canvas.width - 40) / img.width, (canvas.height - 20) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        return canvas.toDataURL('image/png');
      }
    } catch {
      // Fallback to vector drawing
    }
    ctx.font = 'italic 900 92px Arial Black, sans-serif';
    ctx.fillStyle = '#EAB308';
    ctx.fillText('V', 145, 102);
    ctx.fillStyle = '#111827';
    ctx.fillText('L', 235, 102);

    ctx.fillStyle = '#111827';
    ctx.fillRect(90, 114, 120, 8);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(215, 114, 120, 8);
    ctx.fillStyle = '#111827';
    ctx.fillRect(340, 114, 120, 8);

    ctx.font = 'italic 900 36px Arial Black, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('TRANSPORTES', 110, 160);
    return canvas.toDataURL('image/png');
  }

  // AXD
  ctx.font = '900 112px Arial Black, sans-serif';
  ctx.fillStyle = '#1E293B';
  ctx.fillText('A', 95, 130);
  ctx.fillStyle = '#F97316';
  ctx.fillText('.', 182, 130);
  ctx.fillStyle = '#1E293B';
  ctx.fillText('X', 218, 130);
  ctx.fillStyle = '#F97316';
  ctx.fillText('D', 310, 130);
  return canvas.toDataURL('image/png');
}

export interface ParsedTrafficScript {
  empresaMarca: CarrierBrand;
  dataCarregamento: string;
  unidadeOperacional: OperationalUnit;
  comercialResponsavel: string;
  expedicaoResponsavel: string;
  cliente: string;
  telefoneCliente: string;
  motoristaNome: string;
  motoristaTelefone: string;
  emergenciaNome: string;
  emergenciaTelefone: string;
  origem: string;
  destino: string;
  valorFreteEmpresa: number;
  valorFreteMotorista: number;
  favorecido: string;
  tipoChavePix: 'CPF/CNPJ' | 'Celular' | 'E-mail' | 'Chave Aleatória';
  chavePix: string;
  banco: string;
}

export const SAMPLE_TRAFFIC_SCRIPT = `EMPRESA: RODOVAR
DATA CARREGAMENTO: 27/10/2027
UNIDADE: BA - Salvador
COMERCIAL: Jeise / César
EXPEDIÇÃO: Marcos Silva
CLIENTE: AMBEV S.A. - CD CAMAÇARI
TELEFONE CLIENTE: 71 9 9920-2476
MOTORISTA: José Carlos Pereira dos Santos
TELEFONE MOTORISTA: 71 9 8845-1290
CONTATO EMERGÊNCIA: Maria Helena (Esposa)
TELEFONE EMERGÊNCIA: 71 9 9123-4567
ORIGEM: SALVADOR-BA - GALPÃO RODOVAR
DESTINO: VITÓRIA DA CONQUISTA-BA
FRETE EMPRESA: R$ 8.900,00
FRETE MOTORISTA: R$ 6.000,00
FAVORECIDO: José Carlos Pereira Transportes ME
TIPO PIX: CPF/CNPJ
CHAVE PIX: 14.528.901/0001-88
BANCO: 260 - Nu Pagamentos`;

export function parseOperationalTrafficScript(rawText: string): Partial<ParsedTrafficScript> {
  const result: Partial<ParsedTrafficScript> = {};
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parseMoney = (val: string): number => {
    const cleaned = val
      .replace(/[R$\s]/gi, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.toUpperCase().trim();
    const val = rest.join(':').trim();
    if (!val) continue;

    if (key.includes('EMPRESA') || key.includes('MARCA')) {
      const upper = val.toUpperCase();
      if (upper.includes('VL')) result.empresaMarca = 'VL TRANSPORTES';
      else if (upper.includes('AXD')) result.empresaMarca = 'AXD';
      else result.empresaMarca = 'RODOVAR';
    } else if (key.includes('DATA')) {
      result.dataCarregamento = val;
    } else if (key.includes('UNIDADE') || key.includes('FILIAL')) {
      if (val.toUpperCase().includes('SP') || val.toUpperCase().includes('GUARULHOS')) {
        result.unidadeOperacional = 'SP - Guarulhos';
      } else {
        result.unidadeOperacional = 'BA - Salvador';
      }
    } else if (key.includes('COMERCIAL')) {
      result.comercialResponsavel = val;
    } else if (key.includes('EXPEDI')) {
      result.expedicaoResponsavel = val;
    } else if (key.includes('TELEFONE CLIENTE') || key.includes('TEL CLIENTE')) {
      result.telefoneCliente = val;
    } else if (key.includes('CLIENTE')) {
      result.cliente = val.toUpperCase();
    } else if (key.includes('TELEFONE MOTORISTA') || key.includes('TEL MOTORISTA') || key.includes('CEL MOTORISTA')) {
      result.motoristaTelefone = val;
    } else if (key.includes('MOTORISTA') && !key.includes('FRETE')) {
      result.motoristaNome = val;
    } else if (key.includes('TELEFONE EMERG') || key.includes('TEL EMERG')) {
      result.emergenciaTelefone = val;
    } else if (key.includes('EMERG')) {
      result.emergenciaNome = val;
    } else if (key.includes('ORIGEM') || key.includes('COLETA')) {
      result.origem = val.toUpperCase();
    } else if (key.includes('DESTINO') || key.includes('ENTREGA')) {
      result.destino = val.toUpperCase();
    } else if (key.includes('FRETE EMPRESA') || key.includes('VALOR EMPRESA')) {
      result.valorFreteEmpresa = parseMoney(val);
    } else if (key.includes('FRETE MOTORISTA') || key.includes('VALOR MOTORISTA') || key.includes('VALOR FRETE')) {
      result.valorFreteMotorista = parseMoney(val);
    } else if (key.includes('FAVORECIDO') || key.includes('RECEBEDOR')) {
      result.favorecido = val;
    } else if (key.includes('TIPO PIX') || key.includes('TIPO DE CHAVE')) {
      const upper = val.toUpperCase();
      if (upper.includes('CELULAR') || upper.includes('TELEFONE')) result.tipoChavePix = 'Celular';
      else if (upper.includes('MAIL')) result.tipoChavePix = 'E-mail';
      else if (upper.includes('ALEAT')) result.tipoChavePix = 'Chave Aleatória';
      else result.tipoChavePix = 'CPF/CNPJ';
    } else if (key.includes('PIX')) {
      result.chavePix = val;
    } else if (key.includes('BANCO') || key.includes('INSTITUI')) {
      result.banco = val;
    }
  }

  return result;
}
