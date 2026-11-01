/**
 * Base Oficial de Instituições Financeiras do Brasil (FEBRABAN / BACEN)
 * Mapeamento de códigos de compensação, nomes fantasia, razão social e aliases de busca.
 */

export interface BrazilianBank {
  code: string;
  name: string;
  fullName: string;
  aliases?: string[];
  isPopular?: boolean;
}

export const BRAZILIAN_BANKS: BrazilianBank[] = [
  // Principais / Mais Usados
  {
    code: '001',
    name: 'Banco do Brasil',
    fullName: 'Banco do Brasil S.A.',
    aliases: ['bb', 'bancodobrasil'],
    isPopular: true,
  },
  {
    code: '260',
    name: 'Nu Pagamentos (Nubank)',
    fullName: 'Nu Pagamentos S.A. - Instituição de Pagamento',
    aliases: ['nubank', 'nu', 'nu pagamentos'],
    isPopular: true,
  },
  {
    code: '237',
    name: 'Bradesco',
    fullName: 'Banco Bradesco S.A.',
    aliases: ['bradesco'],
    isPopular: true,
  },
  {
    code: '341',
    name: 'Itaú Unibanco',
    fullName: 'Itaú Unibanco S.A.',
    aliases: ['itau', 'itaucard', 'unibanco'],
    isPopular: true,
  },
  {
    code: '104',
    name: 'Caixa Econômica Federal',
    fullName: 'Caixa Econômica Federal',
    aliases: ['caixa', 'cef', 'poupança caixa'],
    isPopular: true,
  },
  {
    code: '033',
    name: 'Santander',
    fullName: 'Banco Santander (Brasil) S.A.',
    aliases: ['santander', 'santander brasil'],
    isPopular: true,
  },
  {
    code: '077',
    name: 'Banco Inter',
    fullName: 'Banco Inter S.A.',
    aliases: ['inter', 'banco intermedium'],
    isPopular: true,
  },
  {
    code: '336',
    name: 'C6 Bank',
    fullName: 'Banco C6 S.A.',
    aliases: ['c6', 'c6 bank'],
    isPopular: true,
  },
  {
    code: '748',
    name: 'Sicredi',
    fullName: 'Banco Cooperativo Sicredi S.A.',
    aliases: ['sicredi'],
    isPopular: true,
  },
  {
    code: '756',
    name: 'Sicoob',
    fullName: 'Banco Cooperativo Sicoob S.A.',
    aliases: ['sicoob', 'bancoob'],
    isPopular: true,
  },
  {
    code: '290',
    name: 'PagBank (PagSeguro)',
    fullName: 'PagSeguro Internet S.A.',
    aliases: ['pagbank', 'pagseguro'],
    isPopular: true,
  },
  {
    code: '380',
    name: 'PicPay',
    fullName: 'PicPay Instituição de Pagamento S.A.',
    aliases: ['picpay'],
    isPopular: true,
  },
  {
    code: '323',
    name: 'Mercado Pago',
    fullName: 'Mercado Pago Instituição de Pagamento Ltda.',
    aliases: ['mercadopago', 'mercado pago'],
    isPopular: true,
  },
  {
    code: '208',
    name: 'BTG Pactual',
    fullName: 'Banco BTG Pactual S.A.',
    aliases: ['btg', 'btg pactual'],
    isPopular: true,
  },
  {
    code: '422',
    name: 'Banco Safra',
    fullName: 'Banco Safra S.A.',
    aliases: ['safra'],
    isPopular: true,
  },
  {
    code: '655',
    name: 'Banco Votorantim (Banco BV)',
    fullName: 'Banco Votorantim S.A.',
    aliases: ['bv', 'votorantim'],
    isPopular: true,
  },
  {
    code: '212',
    name: 'Banco Original',
    fullName: 'Banco Original S.A.',
    aliases: ['original'],
    isPopular: true,
  },
  {
    code: '121',
    name: 'Agibank',
    fullName: 'Banco Agibank S.A.',
    aliases: ['agibank', 'agiplan'],
    isPopular: true,
  },
  {
    code: '318',
    name: 'Banco BMG',
    fullName: 'Banco BMG S.A.',
    aliases: ['bmg'],
    isPopular: true,
  },
  {
    code: '623',
    name: 'Banco PAN',
    fullName: 'Banco PAN S.A.',
    aliases: ['pan', 'panamericano'],
    isPopular: true,
  },
  {
    code: '041',
    name: 'Banrisul',
    fullName: 'Banco do Estado do Rio Grande do Sul S.A.',
    aliases: ['banrisul'],
    isPopular: true,
  },
  {
    code: '070',
    name: 'BRB - Banco de Brasília',
    fullName: 'Banco de Brasília S.A.',
    aliases: ['brb', 'bancodebrasilia'],
    isPopular: true,
  },
  {
    code: '004',
    name: 'Banco do Nordeste (BNB)',
    fullName: 'Banco do Nordeste do Brasil S.A.',
    aliases: ['bnb', 'bancodonordeste'],
    isPopular: true,
  },
  {
    code: '003',
    name: 'Banco da Amazônia (BASA)',
    fullName: 'Banco da Amazônia S.A.',
    aliases: ['basa', 'bancodaamazonia'],
  },
  {
    code: '021',
    name: 'Banestes',
    fullName: 'Banco do Estado do Espírito Santo S.A.',
    aliases: ['banestes'],
  },
  {
    code: '403',
    name: 'Cora SCD',
    fullName: 'Cora Sociedade de Crédito Direto S.A.',
    aliases: ['cora', 'corabank'],
  },
  {
    code: '637',
    name: 'Banco Sofisa',
    fullName: 'Banco Sofisa S.A.',
    aliases: ['sofisa', 'sofisa direto'],
  },
  {
    code: '707',
    name: 'Banco Daycoval',
    fullName: 'Banco Daycoval S.A.',
    aliases: ['daycoval'],
  },
  {
    code: '218',
    name: 'Banco BS2',
    fullName: 'Banco BS2 S.A.',
    aliases: ['bs2', 'bonsucesso'],
  },
  {
    code: '136',
    name: 'Unicred',
    fullName: 'Confederação Nacional das Cooperativas Centrais Unicred',
    aliases: ['unicred'],
  },
  {
    code: '085',
    name: 'Ailos (Viacredi)',
    fullName: 'Cooperativa Central de Crédito Urbano - Ailos',
    aliases: ['ailos', 'viacredi'],
  },
  {
    code: '745',
    name: 'Citibank',
    fullName: 'Banco Citibank S.A.',
    aliases: ['citibank', 'citi'],
  },
  {
    code: '246',
    name: 'Banco ABC Brasil',
    fullName: 'Banco ABC Brasil S.A.',
    aliases: ['abc', 'abc brasil'],
  },
  {
    code: '074',
    name: 'Banco J. Safra',
    fullName: 'Banco J. Safra S.A.',
    aliases: ['j safra'],
  },
  {
    code: '025',
    name: 'Banco Alfa',
    fullName: 'Banco Alfa S.A.',
    aliases: ['alfa'],
  },
  {
    code: '063',
    name: 'Bradescard',
    fullName: 'Banco Bradescard S.A.',
    aliases: ['bradescard'],
  },
  {
    code: '029',
    name: 'Banco Itaú Consignado',
    fullName: 'Banco Itaú Consignado S.A.',
    aliases: ['itau consignado'],
  },
  {
    code: '332',
    name: 'Acesso Soluções de Pagamento',
    fullName: 'Acesso Soluções de Pagamento S.A.',
    aliases: ['acesso', 'acessocard'],
  },
  {
    code: '197',
    name: 'Stone Pagamentos',
    fullName: 'Stone Pagamentos S.A.',
    aliases: ['stone', 'stone ip'],
  },
  {
    code: '301',
    name: 'BPP Instituição de Pagamento',
    fullName: 'Dock Instituição de Pagamento S.A.',
    aliases: ['dock', 'bpp'],
  },
  {
    code: '065',
    name: 'Banco Andbank',
    fullName: 'Banco Andbank (Brasil) S.A.',
    aliases: ['andbank'],
  },
];

/**
 * Formata para o padrão esperado: [Código] - [Nome do Banco]
 */
export function formatBankOption(bank: BrazilianBank): string {
  return `${bank.code} - ${bank.name}`;
}

/**
 * Remove acentos e caracteres especiais para comparação flexível
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Realiza busca dinâmica por código de compensação ou nome/aliases
 */
export function searchBanks(query: string, limit = 10): BrazilianBank[] {
  const clean = normalizeText(query);
  if (!clean) {
    // Retorna os mais populares inicialmente
    return BRAZILIAN_BANKS.filter((b) => b.isPopular).slice(0, limit);
  }

  // Verifica se o usuário digitou apenas números (busca por código)
  const isOnlyDigits = /^\d+$/.test(clean);

  const matched = BRAZILIAN_BANKS.filter((b) => {
    // Match por código exato ou prefixo
    if (b.code.startsWith(clean)) return true;

    // Se for número, não precisa verificar nomes se não quiser
    if (isOnlyDigits) return false;

    // Match por nome fantasia
    const nameNorm = normalizeText(b.name);
    if (nameNorm.includes(clean)) return true;

    // Match por razão social
    const fullNorm = normalizeText(b.fullName);
    if (fullNorm.includes(clean)) return true;

    // Match por aliases
    if (b.aliases?.some((alias) => normalizeText(alias).includes(clean))) return true;

    return false;
  });

  return matched.slice(0, limit);
}

/**
 * Procura um banco existente a partir do valor digitado ou selecionado
 */
export function findBankByValue(val: string): BrazilianBank | undefined {
  if (!val) return undefined;
  const clean = normalizeText(val);

  // Tentativa 1: Formato padrão "[Código] - [Nome]" ou "[Código] - ..."
  const codeMatch = val.match(/^(\d{3})\b/);
  if (codeMatch) {
    const code = codeMatch[1];
    const found = BRAZILIAN_BANKS.find((b) => b.code === code);
    if (found) return found;
  }

  // Tentativa 2: Igualdade exata de código
  const byCode = BRAZILIAN_BANKS.find((b) => b.code === clean);
  if (byCode) return byCode;

  // Tentativa 3: Nome exato ou alias
  const byName = BRAZILIAN_BANKS.find(
    (b) =>
      normalizeText(b.name) === clean ||
      normalizeText(b.fullName) === clean ||
      b.aliases?.some((a) => normalizeText(a) === clean)
  );
  if (byName) return byName;

  // Tentativa 4: Nome aproximado
  const byPrefix = BRAZILIAN_BANKS.find(
    (b) =>
      normalizeText(b.name).startsWith(clean) ||
      clean.startsWith(normalizeText(b.name))
  );
  return byPrefix;
}

/**
 * Validação: Verifica se o valor corresponde a um banco oficial cadastrado
 */
export function isValidBank(val: string): boolean {
  if (!val || !val.trim()) return false;
  const found = findBankByValue(val);
  return !!found;
}
