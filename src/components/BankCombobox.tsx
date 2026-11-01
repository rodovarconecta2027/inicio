import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, AlertCircle, Building2, ChevronDown, X } from 'lucide-react';
import {
  BRAZILIAN_BANKS,
  BrazilianBank,
  formatBankOption,
  searchBanks,
  findBankByValue,
  isValidBank,
} from '../data/brazilianBanks';

interface BankComboboxProps {
  value: string;
  onChange: (formattedValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string | null;
}

export const BankCombobox: React.FC<BankComboboxProps> = ({
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  error: customError,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sincroniza query com o value externo se mudar externamente
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Filtro de bancos em tempo real
  const filteredBanks = useMemo(() => {
    return searchBanks(query, 12);
  }, [query]);

  // Verifica se o valor atual é válido na base oficial
  const currentBank = useMemo(() => {
    return findBankByValue(value);
  }, [value]);

  const isCurrentValid = !!currentBank;
  const hasUserTyped = query.trim().length > 0;
  const showInvalidNotice = hasUserTyped && !isCurrentValid && !isOpen;

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Ao sair, se houver um banco correspondente ou exato, auto-ajusta
        const match = findBankByValue(query);
        if (match) {
          const formatted = formatBankOption(match);
          setQuery(formatted);
          onChange(formatted);
        } else if (!query.trim()) {
          onChange('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [query, onChange]);

  const handleSelectBank = (bank: BrazilianBank) => {
    const formatted = formatBankOption(bank);
    setQuery(formatted);
    onChange(formatted);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery('');
    onChange('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredBanks.length ? prev + 1 : 0));
      // Scroll item into view
      scrollItemIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredBanks.length - 1));
      scrollItemIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredBanks[highlightedIndex]) {
        handleSelectBank(filteredBanks[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const scrollItemIntoView = (index: number) => {
    if (!dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('[data-combobox-item]');
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Campo de Input com visual moderno */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          required={required}
          value={query}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setIsOpen(true);
            setHighlightedIndex(0);
            // Se encontrar exato na digitação, propaga
            const exact = findBankByValue(val);
            if (exact && (val === exact.code || normalizeSimple(val) === normalizeSimple(exact.name))) {
              onChange(formatBankOption(exact));
            } else {
              onChange(val);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Digite o código (ex: 260) ou nome (ex: Nubank)"
          className={`w-full border rounded-xl pl-8 pr-16 py-2 text-xs font-semibold text-[#15191D] placeholder:text-gray-400 transition-all outline-none ${
            showInvalidNotice || customError
              ? 'border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
              : isCurrentValid
              ? 'border-emerald-400 bg-emerald-50/15 focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15]'
              : 'border-gray-300 focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15]'
          }`}
          autoComplete="off"
        />

        {/* Ícone Inicial (Prédio/Banco) */}
        <div className="absolute left-2.5 pointer-events-none text-gray-400">
          <Building2 className="w-3.5 h-3.5" />
        </div>

        {/* Botões e Ícones de Ação à direita */}
        <div className="absolute right-2 flex items-center gap-1">
          {query && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Limpar campo"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {isCurrentValid && (
            <span
              className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700"
              title="Instituição reconhecida no BACEN"
            >
              <Check className="w-2.5 h-2.5" />
            </span>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
              } else {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerta de banco não reconhecido */}
      {(showInvalidNotice || customError) && (
        <p className="mt-1 text-[11px] font-semibold text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{customError || 'Instituição não reconhecida. Escolha um banco oficial na lista.'}</span>
        </p>
      )}

      {/* Dropdown com a lista suspensa */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-200 py-1 text-xs divide-y divide-gray-50"
        >
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between bg-gray-50/70">
            <span>Bancos Oficiais FEBRABAN / BACEN</span>
            <span>{filteredBanks.length} encontrados</span>
          </div>

          {filteredBanks.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-gray-500">
              <p className="font-semibold text-gray-700">Nenhum banco encontrado</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Tente digitar o código (ex: 260, 001) ou nome (ex: Itaú, Nubank).
              </p>
            </div>
          ) : (
            filteredBanks.map((bank, index) => {
              const isSelected = currentBank?.code === bank.code;
              const isHighlighted = highlightedIndex === index;

              return (
                <div
                  key={bank.code}
                  data-combobox-item
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelectBank(bank)}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                    isHighlighted ? 'bg-amber-50/80 text-[#15191D]' : 'hover:bg-gray-50 text-gray-700'
                  } ${isSelected ? 'font-bold bg-amber-50' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[10px] font-bold border border-gray-200">
                      {bank.code}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-[#15191D]">{bank.name}</span>
                      <span className="text-[10px] text-gray-400 block truncate">{bank.fullName}</span>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="shrink-0 text-emerald-600">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

function normalizeSimple(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
