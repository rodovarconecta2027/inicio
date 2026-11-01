import React, { useRef, useState, useCallback } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  Eye,
  Download,
  Check,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import {
  Employee,
  FreightAttachmentCategory,
  UnifiedFreightAttachment,
  UnifiedFreightRecord,
} from '../types';
import {
  apiDeleteAllFreightAttachments,
  apiDeleteFreightAttachment,
  apiDownloadFreightAttachment,
  apiUploadFreightAttachment,
  apiVerifyFreightAttachment,
} from '../lib/serverApi';
import { canViewFreightTeam } from '../lib/permissions';

export interface FreightDocumentsManagerProps {
  freight: UnifiedFreightRecord;
  currentUser: Employee;
  savedAttachments: UnifiedFreightAttachment[];
  onAttachmentsUpdated: (newAttachments: UnifiedFreightAttachment[], updatedFreight?: UnifiedFreightRecord) => void;
  canVerify?: boolean;
}

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  category: FreightAttachmentCategory;
  progress: number; // 0 to 100
  status: 'PENDING' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  dataUrl?: string;
}

const CATEGORY_LABELS: Record<FreightAttachmentCategory, string> = {
  COMERCIAL: 'Documento comercial',
  CTE: 'CT-e / Nota Fiscal',
  MDFE: 'MDF-e',
  RPA: 'RPA / Contrato Motorista',
  ORDEM_CARREGAMENTO: 'Ordem de Coleta Assinada',
  COMPROVANTE_ENTREGA: 'Comprovante de Entrega (Canhoto)',
  OUTRO: 'Documento CNH / CRLV / Outro',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const FreightDocumentsManager: React.FC<FreightDocumentsManagerProps> = ({
  freight,
  currentUser,
  savedAttachments,
  onAttachmentsUpdated,
  canVerify = false,
}) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [batchCategory, setBatchCategory] = useState<FreightAttachmentCategory>('CTE');
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals for deletion confirmation
  const [deletingAtt, setDeletingAtt] = useState<UnifiedFreightAttachment | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAssignedOrManager =
    currentUser.accessLevel === 'ADMINISTRADOR' ||
    currentUser.accessLevel === 'DIRETORIA' ||
    freight.comercialResponsavelId === currentUser.id ||
    freight.expedicaoResponsavelId === currentUser.id ||
    freight.monitoramentoResponsavelId === currentUser.id ||
    canViewFreightTeam(currentUser);

  const canBulkDelete =
    currentUser.accessLevel === 'ADMINISTRADOR' ||
    currentUser.accessLevel === 'DIRETORIA' ||
    freight.comercialResponsavelId === currentUser.id ||
    freight.expedicaoResponsavelId === currentUser.id;

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const newItems: QueuedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      // Max 10MB per file check
      if (f.size > 10 * 1024 * 1024) {
        setFeedback({
          type: 'error',
          message: `O arquivo "${f.name}" excede o limite máximo de 10 MB.`,
        });
        continue;
      }
      newItems.push({
        id: `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        name: f.name,
        sizeBytes: f.size,
        category: batchCategory,
        progress: 0,
        status: 'PENDING',
      });
    }

    setQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
  };

  const processUploadQueue = async (onlyFailed: boolean = false) => {
    const targets = queue.filter((item) =>
      onlyFailed ? item.status === 'ERROR' : item.status === 'PENDING' || item.status === 'ERROR'
    );
    if (targets.length === 0) return;

    setIsUploadingBatch(true);
    setFeedback(null);

    let latestAttachments = [...savedAttachments];
    let latestFreight: UnifiedFreightRecord | undefined;
    let anySuccess = false;

    for (const item of targets) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'UPLOADING', progress: 30 } : q))
      );

      try {
        const dataUrl = item.dataUrl || (await readFileAsDataUrl(item.file));
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progress: 65, dataUrl } : q))
        );

        const res = await apiUploadFreightAttachment(freight.id, {
          fileName: item.name,
          idempotencyKey: item.id,
          category: item.category,
          dataUrl,
        });

        if (res.ok && res.anexos) {
          latestAttachments = res.anexos;
          if (res.freight) latestFreight = res.freight;
          anySuccess = true;
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'SUCCESS', progress: 100 } : q))
          );
        } else {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: 'ERROR',
                    progress: 0,
                    errorMessage: res.error || 'Erro no envio.',
                  }
                : q
            )
          );
        }
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'ERROR',
                  progress: 0,
                  errorMessage: err?.message || 'Falha de conexão.',
                }
              : q
          )
        );
      }
    }

    setIsUploadingBatch(false);
    if (anySuccess) {
      onAttachmentsUpdated(latestAttachments, latestFreight);
      setFeedback({
        type: 'success',
        message: 'Documentos enviados e vinculados ao frete com sucesso!',
      });
      // Automatically remove successfully uploaded files from the queue after 2.5s
      setTimeout(() => {
        setQueue((prev) => prev.filter((q) => q.status !== 'SUCCESS'));
      }, 2500);
    }
  };

  const handleVerify = async (att: UnifiedFreightAttachment, nextVal: boolean) => {
    try {
      const res = await apiVerifyFreightAttachment(freight.id, att.id, nextVal);
      if (res.ok && res.anexos) {
        onAttachmentsUpdated(res.anexos, res.freight);
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteSingleConfirm = async () => {
    if (!deletingAtt) return;
    setIsDeletingSingle(true);
    try {
      const res = await apiDeleteFreightAttachment(freight.id, deletingAtt.id);
      if (res.ok && res.anexos) {
        onAttachmentsUpdated(res.anexos, res.freight);
        setFeedback({ type: 'success', message: 'Documento excluído com sucesso.' });
        setDeletingAtt(null);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir documento.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Falha ao excluir documento.' });
    } finally {
      setIsDeletingSingle(false);
    }
  };

  const handleDeleteAllConfirm = async () => {
    setIsDeletingAll(true);
    try {
      const res = await apiDeleteAllFreightAttachments(freight.id);
      if (res.ok) {
        onAttachmentsUpdated([], res.freight);
        setFeedback({ type: 'success', message: 'Todos os documentos foram excluídos com sucesso.' });
        setShowConfirmDeleteAll(false);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir documentos.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Falha ao excluir documentos.' });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const failedCount = queue.filter((q) => q.status === 'ERROR').length;
  const pendingCount = queue.filter((q) => q.status === 'PENDING').length;

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Select files bar */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-extrabold text-[#15191D]">
              Adicionar Documentos do Frete
            </span>
            <p className="text-[11px] text-slate-500">
              Selecione múltiplos arquivos (PDF, imagens) de até 10 MB cada. Adicione à fila sem fechar a janela.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={batchCategory}
              onChange={(e) => setBatchCategory(e.target.value as FreightAttachmentCategory)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-medium text-slate-800"
            >
              {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => (
                <option key={catKey} value={catKey}>
                  {catLabel}
                </option>
              ))}
            </select>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={handleFilesSelected}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Escolher Arquivos (Multiplos)</span>
            </button>
          </div>
        </div>

        {/* Upload Queue Section */}
        {queue.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Fila de Envio ({queue.length} arquivo(s))
              </span>
              <div className="flex items-center gap-2">
                {failedCount > 0 && (
                  <button
                    type="button"
                    disabled={isUploadingBatch}
                    onClick={() => processUploadQueue(true)}
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reenviar {failedCount} com falha</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isUploadingBatch}
                  onClick={clearQueue}
                  className="text-[11px] font-bold text-slate-500 hover:text-red-600 px-2 py-1"
                >
                  Limpar fila
                </button>
                <button
                  type="button"
                  disabled={isUploadingBatch || (pendingCount === 0 && failedCount === 0)}
                  onClick={() => processUploadQueue(false)}
                  className="inline-flex items-center gap-1.5 bg-[#080B0D] hover:bg-slate-800 text-[#FFD400] text-xs font-extrabold px-3.5 py-1 rounded-lg cursor-pointer disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {isUploadingBatch ? 'Enviando...' : `Enviar ${pendingCount + failedCount} Arquivo(s)`}
                  </span>
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100 pr-1">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="pt-1.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate">{item.name}</span>
                      <span className="text-[10px] text-slate-400">({formatBytes(item.sizeBytes)})</span>
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                        {item.category}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {item.status === 'UPLOADING' && (
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-[#FFD400] h-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.status === 'ERROR' && (
                      <p className="text-[10px] font-bold text-red-600 mt-0.5">
                        {item.errorMessage || 'Falha no envio.'}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === 'SUCCESS' && (
                      <span className="text-emerald-600 flex items-center gap-1 font-bold text-[11px]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Enviado</span>
                      </span>
                    )}
                    {item.status === 'UPLOADING' && (
                      <span className="text-slate-500 font-bold text-[11px]">Enviando...</span>
                    )}
                    {item.status === 'ERROR' && (
                      <span className="text-red-600 font-bold text-[11px]">Falhou</span>
                    )}
                    {item.status !== 'UPLOADING' && item.status !== 'SUCCESS' && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(item.id)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Remover da fila"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Saved Attachments List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-[#15191D]">
              Documentos Salvos no Servidor ({savedAttachments.length})
            </span>
          </div>

          {canBulkDelete && savedAttachments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowConfirmDeleteAll(true)}
              className="text-[11px] font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Excluir Todos os Documentos</span>
            </button>
          )}
        </div>

        {savedAttachments.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
            Nenhum documento salvo ou anexado a este frete ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {savedAttachments.map((att) => (
              <div
                key={att.id}
                className="p-3 bg-white border border-slate-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-extrabold bg-[#080B0D] text-[#FFD400] px-2 py-0.5 rounded">
                      {CATEGORY_LABELS[att.category] || att.category}
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">{att.fileName}</span>
                    {att.sizeBytes && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({formatBytes(att.sizeBytes)})
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                    <span>Enviado por: {att.uploadedByName || 'Colaborador'}</span>
                    <span>•</span>
                    <span>{att.uploadedAtFormatted}</span>
                    {att.conferido && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Conferido por {att.conferidoPorNome} ({att.conferidoEmFormatado})</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {/* Download Button */}
                  <button
                    type="button"
                    onClick={() => apiDownloadFreightAttachment(freight.id, att.id, att.fileName)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title="Baixar documento oficial"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Baixar</span>
                  </button>

                  {/* Verify / Conferir Button */}
                  {canVerify && isAssignedOrManager && (
                    <button
                      type="button"
                      onClick={() => handleVerify(att, !att.conferido)}
                      className={`p-1.5 rounded-lg inline-flex items-center gap-1 text-xs font-bold cursor-pointer transition ${
                        att.conferido
                          ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                          : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={att.conferido ? 'Desmarcar conferência' : 'Conferir documento'}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{att.conferido ? '✓ Conferido' : 'Conferir'}</span>
                    </button>
                  )}

                  {/* Delete Single Button (Requires Confirmation) */}
                  {isAssignedOrManager && (
                    <button
                      type="button"
                      onClick={() => setDeletingAtt(att)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                      title="Excluir documento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal: Delete Single Attachment */}
      {deletingAtt && (
        <div className="fixed inset-0 z-60 bg-[#080B0D]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-300 max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 text-[#E5252A] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#15191D]">Excluir documento salvo?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Confirma a exclusão definitiva do arquivo <strong>"{deletingAtt.fileName}"</strong>? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeletingSingle}
                onClick={() => setDeletingAtt(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingSingle}
                onClick={handleDeleteSingleConfirm}
                className="px-3.5 py-1.5 rounded-lg bg-[#E5252A] hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer"
              >
                {isDeletingSingle ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete All Attachments */}
      {showConfirmDeleteAll && (
        <div className="fixed inset-0 z-60 bg-[#080B0D]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-red-300 max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 text-[#E5252A] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#15191D]">Excluir TODOS os documentos?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Confirma a remoção de todos os <strong>{savedAttachments.length}</strong> documentos salvos deste frete? Esta ação é irreversível e ficará registrada na auditoria.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={() => setShowConfirmDeleteAll(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={handleDeleteAllConfirm}
                className="px-3.5 py-1.5 rounded-lg bg-[#E5252A] hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer"
              >
                {isDeletingAll ? 'Excluindo...' : 'Excluir Todos os Documentos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
