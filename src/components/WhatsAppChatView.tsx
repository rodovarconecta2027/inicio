import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Mic,
  Smile,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Share2,
  Play,
  Pause,
  Trash2,
  CheckCheck,
  Search,
  Users,
  Plus,
  X,
  Pin,
  Download,
  Copy,
  Check,
  Volume2,
  CornerUpRight,
  Sparkles,
  Phone,
  MoreVertical,
  Square,
} from 'lucide-react';
import { ChatMessage, ChatThread, Department, Employee } from '../types';

export interface SendMessageOptions {
  attachment?: string;
  attachmentSize?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  audioDuration?: string;
  forwardedFrom?: string;
}

interface WhatsAppChatViewProps {
  activeSection: 'mensagens' | 'grupos';
  currentUser: Employee;
  employees: Employee[];
  chats: ChatThread[];
  onSendMessage: (
    threadId: string,
    text: string,
    attachment?: string,
    attachmentSize?: string,
    extra?: SendMessageOptions
  ) => void;
  onMarkThreadRead: (threadId: string) => void;
  onCreateGroupChat?: (groupData: {
    name: string;
    department: Department | 'Todos';
    roleOrDept: string;
    pinnedNotice?: string;
    participantIds: string[];
  }) => void;
  onUpdateThreadPinnedNotice?: (threadId: string, pinnedNotice: string) => void;
  onTogglePinMessage?: (threadId: string, messageId: string) => void;
  onDeleteMessage?: (threadId: string, messageId: string) => void;
  onManageGroupParticipants?: (threadId: string, participantIds: string[]) => void;
  onStartDirectChat: (emp: Employee) => string | void;
  onForwardToTargets?: (
    targetEmployeeIds: string[],
    targetGroupIds: string[],
    messagePayload: {
      text: string;
      attachment?: string;
      attachmentSize?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      mediaUrl?: string;
      audioDuration?: string;
      forwardedFrom: string;
    }
  ) => void;
}

// Helper: Generate a real playable WAV data URL (for fallback voice messages & demo audio)
export function createSynthesizedWavDataUrl(durationSec = 4): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Pleasant chime + speech-like cadence envelope
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllableEnvelope = Math.max(0, Math.sin(t * Math.PI * 3.2)) * Math.exp(-t * 0.25);
    const freq = 220 + 65 * Math.sin(t * 4.5) + 30 * Math.cos(t * 9.0);
    const sample = Math.sin(2 * Math.PI * freq * t) * syllableEnvelope * 0.35;
    const pcmValue = Math.max(-1, Math.min(1, sample)) * 32767;
    view.setInt16(44 + i * 2, pcmValue, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// Inline WhatsApp Voice Note Player Component
const WhatsAppAudioPlayer: React.FC<{
  audioUrl?: string;
  durationLabel?: string;
  senderAvatar?: string;
  isMe?: boolean;
}> = ({ audioUrl, durationLabel = '0:05', senderAvatar, isMe }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('0:00');
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const effectiveAudioSrc = useMemo(
    () => audioUrl || createSynthesizedWavDataUrl(5),
    [audioUrl]
  );

  const formatSec = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.playbackRate = playbackRate;
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const cycleSpeed = () => {
    const next: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const waveformBars = [
    35, 65, 45, 80, 55, 90, 40, 75, 60, 95, 50, 70, 85, 40, 60, 75, 50, 88, 62, 45, 70, 55, 38,
    65,
  ];

  return (
    <div
      className={`flex items-center gap-2.5 p-2 rounded-xl min-w-[240px] sm:min-w-[280px] ${
        isMe ? 'bg-[#c5f6be]/70' : 'bg-gray-100/90'
      }`}
    >
      <audio
        ref={audioRef}
        src={effectiveAudioSrc}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (!el) return;
          const dur = el.duration || 5;
          setProgress(Math.min(100, (el.currentTime / dur) * 100));
          setCurrentTimeStr(formatSec(el.currentTime));
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTimeStr('0:00');
        }}
      />

      {/* Avatar with Mic Badge */}
      <div className="relative shrink-0">
        <img
          src={senderAvatar || '/assets/avatar-joao.jpg'}
          alt="Voz"
          referrerPolicy="no-referrer"
          className="w-10 h-10 rounded-full object-cover border border-emerald-500/40"
        />
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#00A884] text-white flex items-center justify-center shadow-xs">
          <Mic className="w-2.5 h-2.5" />
        </span>
      </div>

      {/* Play / Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-[#00A884] hover:bg-[#008f6f] text-white flex items-center justify-center shrink-0 shadow-xs cursor-pointer transition"
        title={isPlaying ? 'Pausar áudio' : 'Ouvir mensagem de voz'}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform & Time */}
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-[3px] h-6 cursor-pointer"
          onClick={(e) => {
            const el = audioRef.current;
            if (!el) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            el.currentTime = (el.duration || 5) * ratio;
            setProgress(ratio * 100);
          }}
        >
          {waveformBars.map((height, idx) => {
            const barPct = (idx / waveformBars.length) * 100;
            const active = barPct <= progress;
            return (
              <span
                key={idx}
                style={{ height: `${ Math.max(25, height) }%` }}
                className={`w-1 rounded-full transition-colors ${
                  active ? 'bg-[#00A884]' : 'bg-gray-400/50'
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-600 mt-0.5">
          <span>{isPlaying || progress > 0 ? currentTimeStr : durationLabel}</span>
          <span className="inline-flex items-center gap-1 text-[#008069] font-bold">
            <Volume2 className="w-3 h-3" /> Áudio Voz
          </span>
        </div>
      </div>

      {/* Speed Toggle (1x / 1.5x / 2x) */}
      <button
        type="button"
        onClick={cycleSpeed}
        className="px-2 py-0.5 rounded-full bg-black/10 hover:bg-black/20 text-[10px] font-extrabold text-gray-800 shrink-0 cursor-pointer"
        title="Velocidade do áudio"
      >
        {playbackRate}x
      </button>
    </div>
  );
};

const EMOJI_CATEGORIES = [
  {
    label: 'Mais Usados',
    emojis: ['😀', '😂', '😊', '😍', '🤝', '👍', '👏', '🙏', '🔥', '❤️', '✅', '🎉', '👀', '💯', '🚀', '⭐'],
  },
  {
    label: 'Logística & Operação RODOVAR',
    emojis: ['🚛', '🚚', '📦', '🛣️', '⛽', '📋', '💰', '🚨', '🛠️', '📍', '⏱️', '📄', '🔒', '📞', '⚠️', '🏁'],
  },
  {
    label: 'Expressões & Gestos',
    emojis: ['😎', '🤔', '😅', '🥳', '🤩', '🫡', '💪', '🙌', '👌', '✌️', '✍️', '🎯', '🏆', '📣', '💬', '🔔'],
  },
];

// Demo playable video (HTML5 canvas generated or reliable public MP4 stream + fallback visual player)
const SAMPLE_VIDEOS = [
  {
    title: 'Inspecao_Patio_Frota_Rodovar.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    size: '2.8 MB',
  },
  {
    title: 'Checklist_Carregamento_Docas.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    size: '3.4 MB',
  },
];

export const WhatsAppChatView: React.FC<WhatsAppChatViewProps> = ({
  activeSection,
  currentUser,
  employees,
  chats,
  onSendMessage,
  onMarkThreadRead,
  onCreateGroupChat,
  onUpdateThreadPinnedNotice,
  onTogglePinMessage,
  onDeleteMessage,
  onManageGroupParticipants,
  onStartDirectChat,
  onForwardToTargets,
}) => {
  const [sidebarTab, setSidebarTab] = useState<'todas' | 'funcionarios' | 'grupos' | 'nao_lidas'>(
    activeSection === 'grupos' ? 'grupos' : 'todas'
  );

  useEffect(() => {
    setSidebarTab(activeSection === 'grupos' ? 'grupos' : 'todas');
  }, [activeSection]);

  const [selectedChatId, setSelectedChatId] = useState<string>(() => {
    const firstMatch = chats.find((c) =>
      activeSection === 'grupos' ? c.isGroup : !c.isGroup
    );
    return firstMatch?.id || chats[0]?.id || 'chat-1';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [inChatSearch, setInChatSearch] = useState('');
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Voice recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Lightbox for images/videos
  const [lightboxMedia, setLightboxMedia] = useState<{
    type: 'image' | 'video';
    url: string;
    title: string;
  } | null>(null);

  // Easy Share / Forward Modal
  const [forwardModalMsg, setForwardModalMsg] = useState<{
    text: string;
    attachment?: string;
    attachmentSize?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    mediaUrl?: string;
    audioDuration?: string;
    forwardedFrom: string;
  } | null>(null);
  const [selectedForwardEmpIds, setSelectedForwardEmpIds] = useState<string[]>([]);
  const [selectedForwardGroupIds, setSelectedForwardGroupIds] = useState<string[]>([]);
  const [forwardCustomNote, setForwardCustomNote] = useState('');
  const [shareSuccessToast, setShareSuccessToast] = useState<string | null>(null);

  // Local reactions per message ID
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({
    'm-1': ['👍', '✅'],
    'gm-1': ['🚛', '👏'],
  });
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Modals for group creation & members
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [editingPinnedNotice, setEditingPinnedNotice] = useState(false);
  const [pinnedNoticeDraft, setPinnedNoticeDraft] = useState('');
  const [newGroupForm, setNewGroupForm] = useState({
    name: '',
    department: 'Operacional' as Department | 'Todos',
    roleOrDept: 'Coordenação Operacional',
    pinnedNotice: '',
    participantIds: employees.slice(0, 4).map((e) => e.id),
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active !== false && e.id !== currentUser.id),
    [employees, currentUser.id]
  );

  // Active thread resolution
  const activeThread = useMemo(() => {
    return chats.find((c) => c.id === selectedChatId) || chats[0];
  }, [chats, selectedChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.id, activeThread?.messages.length]);

  const triggerToast = (msg: string) => {
    setShareSuccessToast(msg);
    setTimeout(() => setShareSuccessToast(null), 3500);
  };

  // Start or switch to an employee conversation in 1 click
  const handleSelectEmployeeChat = (emp: Employee) => {
    const existing = chats.find(
      (c) =>
        !c.isGroup &&
        (c.name.toLowerCase() === emp.name.toLowerCase() ||
          (c.participantIds?.includes(emp.id) && c.participantIds?.includes(currentUser.id)))
    );
    if (existing) {
      setSelectedChatId(existing.id);
      onMarkThreadRead(existing.id);
    } else {
      const maybeNewId = onStartDirectChat(emp);
      if (typeof maybeNewId === 'string') {
        setSelectedChatId(maybeNewId);
      } else {
        setTimeout(() => {
          const found = chats.find((c) => !c.isGroup && c.name === emp.name);
          if (found) setSelectedChatId(found.id);
        }, 50);
      }
    }
  };

  // Voice recording handlers
  const startVoiceRecording = async () => {
    setRecordingSeconds(0);
    setIsRecordingVoice(true);
    audioChunksRef.current = [];

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
    }
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.start();
      }
    } catch {
      // Fallback to synthesized WAV if mic is unavailable in preview iframe
      mediaRecorderRef.current = null;
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  const finishAndSendVoiceRecording = () => {
    if (!activeThread) return;
    const durationSec = Math.max(2, recordingSeconds);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durationFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const sendAudioUrl = (dataUrl: string) => {
      onSendMessage(
        activeThread.id,
        `🎤 Mensagem de voz (${durationFormatted})`,
        `Audio_Voz_${new Date().toLocaleTimeString('pt-BR').replace(/:/g, '')}.wav`,
        `${Math.max(18, durationSec * 14)} KB`,
        {
          mediaType: 'audio',
          mediaUrl: dataUrl,
          audioDuration: durationFormatted,
        }
      );
      setIsRecordingVoice(false);
      setRecordingSeconds(0);
      triggerToast('🎤 Áudio de voz enviado na conversa!');
    };

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const rec = mediaRecorderRef.current;
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            sendAudioUrl(
              typeof reader.result === 'string'
                ? reader.result
                : createSynthesizedWavDataUrl(durationSec)
            );
          };
          reader.readAsDataURL(blob);
        } else {
          sendAudioUrl(createSynthesizedWavDataUrl(durationSec));
        }
      };
      try {
        rec.stop();
      } catch {
        sendAudioUrl(createSynthesizedWavDataUrl(durationSec));
      }
    } else {
      sendAudioUrl(createSynthesizedWavDataUrl(durationSec));
    }
  };

  // File upload handler (Image, Video, Audio, Document)
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    forcedType?: 'image' | 'video' | 'audio' | 'document'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeThread) return;

    const sizeKB = Math.max(1, Math.round(file.size / 1024));
    const sizeLabel =
      sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

    let detectedType: 'image' | 'video' | 'audio' | 'document' = forcedType || 'document';
    if (!forcedType) {
      if (file.type.startsWith('image/')) detectedType = 'image';
      else if (file.type.startsWith('video/')) detectedType = 'video';
      else if (file.type.startsWith('audio/')) detectedType = 'audio';
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const defaultCaption =
        detectedType === 'image'
          ? `📷 Foto compartilhada: ${file.name}`
          : detectedType === 'video'
          ? `🎥 Vídeo compartilhado: ${file.name}`
          : detectedType === 'audio'
          ? `🎤 Áudio compartilhado: ${file.name}`
          : `📄 Documento anexado: ${file.name}`;

      onSendMessage(
        activeThread.id,
        messageText.trim() || defaultCaption,
        file.name,
        sizeLabel,
        {
          mediaType: detectedType,
          mediaUrl: dataUrl,
          audioDuration: detectedType === 'audio' ? '0:12' : undefined,
        }
      );
      setMessageText('');
      setShowAttachMenu(false);
      triggerToast(`✓ Arquivo "${file.name}" enviado com sucesso!`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Send Instant Demo Video or Photo so user can test with 1 click
  const handleSendSampleVideo = () => {
    if (!activeThread) return;
    const sample = SAMPLE_VIDEOS[0];
    onSendMessage(
      activeThread.id,
      messageText.trim() || '🎥 Vídeo da operação e checklist de pátio RODOVAR:',
      sample.title,
      sample.size,
      {
        mediaType: 'video',
        mediaUrl: sample.url,
      }
    );
    setMessageText('');
    setShowAttachMenu(false);
    triggerToast('🎥 Vídeo enviado na conversa!');
  };

  const handleSendSamplePhoto = () => {
    if (!activeThread) return;
    onSendMessage(
      activeThread.id,
      messageText.trim() || '📷 Registro fotográfico da frota liberada para viagem:',
      'Frota_Rodovar_Liberada.jpg',
      '640 KB',
      {
        mediaType: 'image',
        mediaUrl: '/assets/banner-truck.jpg',
      }
    );
    setMessageText('');
    setShowAttachMenu(false);
    triggerToast('📷 Foto enviada na conversa!');
  };

  // Handle text message send
  const handleSendText = () => {
    if (!activeThread || !messageText.trim()) return;
    onSendMessage(activeThread.id, messageText.trim());
    setMessageText('');
    setShowEmojiPicker(false);
  };

  // Toggle reaction on message
  const toggleReaction = (msgId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const current = prev[msgId] || [];
      const exists = current.includes(emoji);
      const next = exists ? current.filter((e) => e !== emoji) : [...current, emoji];
      return { ...prev, [msgId]: next };
    });
    setActiveReactionMsgId(null);
  };

  // Execute 1-click forward/share across employees & groups
  const handleConfirmForward = () => {
    if (!forwardModalMsg) return;
    if (selectedForwardEmpIds.length === 0 && selectedForwardGroupIds.length === 0) return;

    const finalText = forwardCustomNote.trim()
      ? `${forwardCustomNote.trim()}\n\n${forwardModalMsg.text}`
      : forwardModalMsg.text;

    if (onForwardToTargets) {
      onForwardToTargets(selectedForwardEmpIds, selectedForwardGroupIds, {
        ...forwardModalMsg,
        text: finalText,
      });
    } else {
      // Fallback: send to matching threads
      selectedForwardGroupIds.forEach((grpId) => {
        onSendMessage(
          grpId,
          finalText,
          forwardModalMsg.attachment,
          forwardModalMsg.attachmentSize,
          {
            mediaType: forwardModalMsg.mediaType,
            mediaUrl: forwardModalMsg.mediaUrl,
            audioDuration: forwardModalMsg.audioDuration,
            forwardedFrom: forwardModalMsg.forwardedFrom,
          }
        );
      });
      selectedForwardEmpIds.forEach((empId) => {
        const emp = employees.find((e) => e.id === empId);
        if (!emp) return;
        const existingThread = chats.find(
          (c) => !c.isGroup && c.name.toLowerCase() === emp.name.toLowerCase()
        );
        if (existingThread) {
          onSendMessage(
            existingThread.id,
            finalText,
            forwardModalMsg.attachment,
            forwardModalMsg.attachmentSize,
            {
              mediaType: forwardModalMsg.mediaType,
              mediaUrl: forwardModalMsg.mediaUrl,
              audioDuration: forwardModalMsg.audioDuration,
              forwardedFrom: forwardModalMsg.forwardedFrom,
            }
          );
        } else {
          onStartDirectChat(emp);
        }
      });
    }

    const totalDest = selectedForwardEmpIds.length + selectedForwardGroupIds.length;
    setForwardModalMsg(null);
    setSelectedForwardEmpIds([]);
    setSelectedForwardGroupIds([]);
    setForwardCustomNote('');
    triggerToast(
      `✓ Compartilhado com sucesso para ${totalDest} ${
        totalDest === 1 ? 'destinatário' : 'destinatários'
      }!`
    );
  };

  // Build unified WhatsApp contact & group list for left sidebar
  const filteredThreads = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return chats.filter((c) => {
      if (sidebarTab === 'grupos' && !c.isGroup) return false;
      if (sidebarTab === 'funcionarios' && c.isGroup) return false;
      if (sidebarTab === 'nao_lidas' && (c.unreadCount || 0) === 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.roleOrDept.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    });
  }, [chats, sidebarTab, searchQuery]);

  // Employees who don't yet have an open thread so user can click any employee directly
  const directEmployeesWithoutThread = useMemo(() => {
    if (sidebarTab === 'grupos' || sidebarTab === 'nao_lidas') return [];
    const q = searchQuery.toLowerCase().trim();
    return activeEmployees.filter((emp) => {
      const hasThread = chats.some(
        (c) => !c.isGroup && c.name.toLowerCase() === emp.name.toLowerCase()
      );
      if (hasThread) return false;
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.roleTitle.toLowerCase().includes(q)
      );
    });
  }, [activeEmployees, chats, sidebarTab, searchQuery]);

  const displayedMessages = useMemo(() => {
    if (!activeThread) return [];
    const q = inChatSearch.toLowerCase().trim();
    if (!q) return activeThread.messages;
    return activeThread.messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q) ||
        (m.attachment && m.attachment.toLowerCase().includes(q))
    );
  }, [activeThread, inChatSearch]);

  const activeParticipantIds = activeThread?.participantIds || [
    currentUser.id,
    'emp-2',
    'emp-3',
  ];

  // Resolve avatar for thread
  const getThreadAvatar = (thread: ChatThread) => {
    if (thread.avatar) return thread.avatar;
    const matchedEmp = employees.find(
      (e) => e.name.toLowerCase() === thread.name.toLowerCase()
    );
    return matchedEmp?.avatar || '/assets/avatar-joao.jpg';
  };

  return (
    <div className="space-y-3">
      {/* Toast Notification */}
      {shareSuccessToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#008069] text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-400/30 flex items-center gap-2.5 text-xs font-extrabold animate-bounce">
          <CheckCheck className="w-4 h-4 text-[#FACC15]" />
          <span>{shareSuccessToast}</span>
        </div>
      )}

      {/* Top WhatsApp Rodovar Banner */}
      <div className="bg-[#111B21] text-white rounded-2xl px-4 py-3 shadow-md border border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00A884] flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                RODOVAR ZAP CORPORATIVO
              </h1>
              <span className="bg-[#00A884]/20 text-[#00E676] border border-[#00A884]/40 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                ● Online em Tempo Real
              </span>
            </div>
            <p className="text-xs text-gray-300">
              Mensagens rápidas, gravação de voz, vídeo, áudio e compartilhamento em 1 clique entre funcionários
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setForwardModalMsg({
                text: '📦 Olá equipe! Segue atualização operacional compartilhada via Rodovar Conecta.',
                forwardedFrom: currentUser.name,
              });
            }}
            className="bg-[#00A884] hover:bg-[#008f6f] text-white font-extrabold text-xs px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartilhar c/ Funcionários</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewGroupModal(true)}
            className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Novo Grupo</span>
          </button>
        </div>
      </div>

      {/* Main WhatsApp Web Container */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* ===================================================================
            LEFT SIDEBAR: CONTACTS, CONVERSATIONS & GROUPS (WHATSAPP STYLE)
        =================================================================== */}
        <div className="lg:col-span-4 border-r border-gray-200 flex flex-col bg-white">
          {/* Logged User Mini Header */}
          <div className="bg-[#F0F2F5] px-3.5 py-2.5 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border-2 border-[#00A884]"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00A884] ring-2 ring-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#111B21] truncate">
                  {currentUser.name}
                </p>
                <p className="text-[10.5px] text-gray-500 truncate">
                  {currentUser.department} • Disponível
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold bg-[#00A884]/15 text-[#008069] px-2 py-0.5 rounded-full">
              {activeEmployees.length + 1} online
            </span>
          </div>

          {/* Search & Filter Pills */}
          <div className="p-2.5 border-b border-gray-100 space-y-2 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar funcionário, setor ou conversa..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F0F2F5] rounded-lg border border-transparent focus:bg-white focus:border-[#00A884] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {[
                { id: 'todas', label: 'Tudo' },
                { id: 'funcionarios', label: `Funcionários (${activeEmployees.length})` },
                { id: 'grupos', label: `Grupos (${chats.filter((c) => c.isGroup).length})` },
                { id: 'nao_lidas', label: 'Não lidas' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id as typeof sidebarTab)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer transition ${
                    sidebarTab === tab.id
                      ? 'bg-[#E7FCE3] text-[#008069] border border-[#00A884]/30'
                      : 'bg-[#F0F2F5] text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contacts & Threads List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 max-h-[520px]">
            {/* Active Threads */}
            {filteredThreads.map((thread) => {
              const lastMsg = thread.messages[thread.messages.length - 1];
              const isSelected = activeThread?.id === thread.id;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    setSelectedChatId(thread.id);
                    onMarkThreadRead(thread.id);
                  }}
                  className={`w-full px-3.5 py-3 text-left flex items-start gap-3 transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#F0F2F5]' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="relative shrink-0">
                    {thread.isGroup ? (
                      <div className="w-11 h-11 rounded-full bg-[#008069] text-white flex items-center justify-center font-extrabold text-xs shadow-2xs">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <img
                        src={getThreadAvatar(thread)}
                        alt={thread.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-full object-cover border border-gray-200"
                      />
                    )}
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#25D366] ring-2 ring-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-extrabold text-[#111B21] truncate">
                        {thread.name}
                      </p>
                      <span
                        className={`text-[10px] shrink-0 ${
                          thread.unreadCount > 0
                            ? 'text-[#00A884] font-extrabold'
                            : 'text-gray-400'
                        }`}
                      >
                        {lastMsg?.timestamp || 'Agora'}
                      </span>
                    </div>

                    <p className="text-[10.5px] text-[#008069] font-semibold truncate">
                      {thread.roleOrDept}
                    </p>

                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                        {lastMsg ? (
                          <>
                            {lastMsg.senderId === currentUser.id && (
                              <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB] shrink-0 inline" />
                            )}
                            <span className="truncate">{lastMsg.text}</span>
                          </>
                        ) : (
                          <span className="italic text-gray-400">
                            Toque para enviar mensagem...
                          </span>
                        )}
                      </p>

                      {thread.unreadCount > 0 && (
                        <span className="bg-[#25D366] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Direct Employees List (1-click instant conversation) */}
            {directEmployeesWithoutThread.length > 0 && (
              <>
                <div className="px-3.5 py-1.5 bg-[#F0F2F5] text-[10px] font-extrabold uppercase tracking-wider text-[#008069]">
                  Contatos da Empresa — Clique para Conversar
                </div>
                {directEmployeesWithoutThread.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleSelectEmployeeChat(emp)}
                    className="w-full px-3.5 py-2.5 text-left flex items-center gap-3 hover:bg-[#E7FCE3]/50 transition-colors cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={emp.avatar || '/assets/avatar-joao.jpg'}
                        alt={emp.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                      />
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25D366] ring-2 ring-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-extrabold text-[#111B21] truncate">
                          {emp.name}
                        </p>
                        <span className="text-[10px] font-bold text-[#008069] bg-[#E7FCE3] px-2 py-0.5 rounded-full">
                          Conversar
                        </span>
                      </div>
                      <p className="text-[10.5px] text-gray-500 truncate">
                        {emp.roleTitle} • {emp.department}
                      </p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ===================================================================
            RIGHT AREA: ACTIVE WHATSAPP CONVERSATION WINDOW
        =================================================================== */}
        <div className="lg:col-span-8 flex flex-col bg-[#EFEAE2] relative">
          {activeThread ? (
            <>
              {/* Conversation Header (#F0F2F5 WhatsApp Web Header) */}
              <div className="bg-[#F0F2F5] px-4 py-2.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {activeThread.isGroup ? (
                      <div className="w-10 h-10 rounded-full bg-[#008069] text-white flex items-center justify-center font-extrabold text-xs">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <img
                        src={getThreadAvatar(activeThread)}
                        alt={activeThread.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-gray-300"
                      />
                    )}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25D366] ring-2 ring-white" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-extrabold text-[#111B21] truncate">
                        {activeThread.name}
                      </h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E7FCE3] text-[#008069]">
                        Online
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      {activeThread.roleOrDept}
                    </p>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowInChatSearch((v) => !v)}
                    className="p-2 rounded-full hover:bg-gray-200 text-gray-600 cursor-pointer"
                    title="Pesquisar nesta conversa"
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  {activeThread.isGroup && (
                    <button
                      type="button"
                      onClick={() => setShowGroupMembersModal(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-gray-100 text-[#111B21] border border-gray-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-[#008069]" />
                      <span>Membros ({activeParticipantIds.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const lastMsg =
                        activeThread.messages[activeThread.messages.length - 1];
                      setForwardModalMsg({
                        text:
                          lastMsg?.text ||
                          ` Compartilhando conversa de ${activeThread.name}`,
                        attachment: lastMsg?.attachment,
                        attachmentSize: lastMsg?.attachmentSize,
                        mediaType: lastMsg?.mediaType,
                        mediaUrl: lastMsg?.mediaUrl,
                        audioDuration: lastMsg?.audioDuration,
                        forwardedFrom: activeThread.name,
                      });
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#00A884] hover:bg-[#008f6f] text-white text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Encaminhar/Compartilhar com outros funcionários"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Compartilhar</span>
                  </button>
                </div>
              </div>

              {/* Optional In-Chat Search Bar */}
              {showInChatSearch && (
                <div className="bg-white px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={inChatSearch}
                    onChange={(e) => setInChatSearch(e.target.value)}
                    placeholder="Buscar palavra, áudio ou arquivo nesta conversa..."
                    className="flex-1 text-xs focus:outline-none"
                    autoFocus
                  />
                  {inChatSearch && (
                    <button
                      type="button"
                      onClick={() => setInChatSearch('')}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Limpar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowInChatSearch(false);
                      setInChatSearch('');
                    }}
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              )}

              {/* Pinned Notice Banner */}
              {activeThread.pinnedNotice && (
                <div className="bg-[#FFFBEB] border-b border-amber-200/80 px-4 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-amber-950 font-semibold truncate">
                      {activeThread.pinnedNotice}
                    </span>
                  </div>
                  {onUpdateThreadPinnedNotice && (
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedNoticeDraft(activeThread.pinnedNotice || '');
                        setEditingPinnedNotice((v) => !v);
                      }}
                      className="text-[10.5px] font-bold text-amber-800 hover:underline shrink-0 cursor-pointer"
                    >
                      Editar Fixado
                    </button>
                  )}
                </div>
              )}

              {editingPinnedNotice && (
                <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 flex items-center gap-2">
                  <input
                    type="text"
                    value={pinnedNoticeDraft}
                    onChange={(e) => setPinnedNoticeDraft(e.target.value)}
                    placeholder="Aviso fixado no topo da conversa..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateThreadPinnedNotice?.(activeThread.id, pinnedNoticeDraft.trim());
                      setEditingPinnedNotice(false);
                    }}
                    className="bg-[#00A884] text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              )}

              {/* ===============================================================
                  MESSAGES STREAM (WHATSAPP BUBBLES + MEDIA + SHARE)
              =============================================================== */}
              <div
                className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[440px]"
                style={{
                  backgroundImage:
                    'radial-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 0)',
                  backgroundSize: '18px 18px',
                }}
              >
                {/* Encryption / Corporate Security Pill */}
                <div className="flex justify-center">
                  <span className="bg-[#FFEECD] text-[#54656F] text-[10.5px] font-medium px-3 py-1 rounded-lg shadow-2xs text-center max-w-md">
                    🔒 Mensagens, áudios e vídeos protegidos na rede interna RODOVAR CONECTA.
                  </span>
                </div>

                {displayedMessages.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-xs font-semibold text-gray-500 bg-white/80 inline-block px-4 py-2 rounded-full shadow-2xs">
                      Nenhuma mensagem ainda. Envie um &quot;Olá&quot;, grave um áudio ou compartilhe um arquivo abaixo!
                    </p>
                  </div>
                ) : (
                  displayedMessages.map((msg) => {
                    const isMe =
                      msg.senderId === currentUser.id || msg.senderName === currentUser.name;
                    const reactions = messageReactions[msg.id] || msg.reactions || [];

                    // Detect media type automatically if not explicitly set
                    const lowerAtt = (msg.attachment || '').toLowerCase();
                    const effectiveMediaType:
                      | 'image'
                      | 'video'
                      | 'audio'
                      | 'document'
                      | undefined =
                      msg.mediaType ||
                      (lowerAtt.endsWith('.mp4') || lowerAtt.endsWith('.webm')
                        ? 'video'
                        : lowerAtt.endsWith('.wav') ||
                          lowerAtt.endsWith('.mp3') ||
                          lowerAtt.endsWith('.ogg')
                        ? 'audio'
                        : lowerAtt.endsWith('.jpg') ||
                          lowerAtt.endsWith('.jpeg') ||
                          lowerAtt.endsWith('.png')
                        ? 'image'
                        : msg.attachment
                        ? 'document'
                        : undefined);

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`group relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                            isMe
                              ? 'bg-[#D9FDD3] text-[#111B21] rounded-tr-xs'
                              : 'bg-white text-[#111B21] rounded-tl-xs'
                          } ${msg.pinned ? 'ring-2 ring-amber-400' : ''}`}
                        >
                          {/* Forwarded Badge */}
                          {msg.forwardedFrom && (
                            <p className="text-[10px] italic text-gray-500 flex items-center gap-1 mb-1">
                              <CornerUpRight className="w-3 h-3" />
                              <span>Encaminhada de {msg.forwardedFrom}</span>
                            </p>
                          )}

                          {/* Sender Header (for incoming messages) */}
                          {!isMe && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[11px] font-extrabold text-[#008069]">
                                {msg.senderName}
                              </span>
                              {msg.senderRole && (
                                <span className="text-[9.5px] font-semibold text-gray-400">
                                  • {msg.senderRole}
                                </span>
                              )}
                            </div>
                          )}

                          {/* MEDIA RENDERERS */}
                          {/* 1. Voice Note / Audio Player */}
                          {effectiveMediaType === 'audio' && (
                            <div className="my-1">
                              <WhatsAppAudioPlayer
                                audioUrl={msg.mediaUrl}
                                durationLabel={msg.audioDuration || '0:06'}
                                senderAvatar={
                                  isMe
                                    ? currentUser.avatar
                                    : getThreadAvatar(activeThread)
                                }
                                isMe={isMe}
                              />
                            </div>
                          )}

                          {/* 2. Video Player Inline */}
                          {effectiveMediaType === 'video' && (
                            <div className="my-1.5 rounded-xl overflow-hidden bg-black border border-black/10 max-w-sm">
                              <video
                                src={
                                  msg.mediaUrl ||
                                  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                                }
                                controls
                                preload="metadata"
                                className="w-full max-h-56 object-cover"
                              />
                              <div className="bg-black/80 text-white px-2.5 py-1 flex items-center justify-between text-[10px]">
                                <span className="truncate font-semibold">
                                  🎥 {msg.attachment || 'Vídeo Operacional'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      type: 'video',
                                      url:
                                        msg.mediaUrl ||
                                        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                                      title: msg.attachment || 'Vídeo Corporativo',
                                    })
                                  }
                                  className="text-[#FACC15] font-bold hover:underline cursor-pointer ml-2 shrink-0"
                                >
                                  Tela Cheia
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 3. Image Preview Inline */}
                          {effectiveMediaType === 'image' && (
                            <div className="my-1.5 rounded-xl overflow-hidden border border-black/10 max-w-xs">
                              <img
                                src={msg.mediaUrl || '/assets/banner-truck.jpg'}
                                alt={msg.attachment || 'Imagem'}
                                referrerPolicy="no-referrer"
                                onClick={() =>
                                  setLightboxMedia({
                                    type: 'image',
                                    url: msg.mediaUrl || '/assets/banner-truck.jpg',
                                    title: msg.attachment || 'Foto compartilhada',
                                  })
                                }
                                className="w-full max-h-52 object-cover cursor-pointer hover:opacity-95 transition"
                              />
                            </div>
                          )}

                          {/* 4. Document Card */}
                          {effectiveMediaType === 'document' && msg.attachment && (
                            <div
                              className={`my-1.5 p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                                isMe
                                  ? 'bg-[#c5f6be]/60 border-emerald-300'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-[#008069] text-white flex items-center justify-center shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#111B21] truncate">
                                    {msg.attachment}
                                  </p>
                                  <p className="text-[10px] text-gray-500">
                                    {msg.attachmentSize || '420 KB'} • Documento
                                  </p>
                                </div>
                              </div>
                              <a
                                href={msg.mediaUrl || '#'}
                                download={msg.attachment}
                                onClick={(e) => {
                                  if (!msg.mediaUrl) {
                                    e.preventDefault();
                                    triggerToast(`📥 Download iniciado: ${msg.attachment}`);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-white hover:bg-gray-100 text-[#008069] border border-gray-200 shrink-0"
                                title="Baixar arquivo"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}

                          {/* Message Text */}
                          <p className="text-xs leading-relaxed whitespace-pre-line break-words">
                            {msg.text}
                          </p>

                          {/* Bottom Timestamp + Read Checkmarks + Easy Action Bar */}
                          <div className="mt-1.5 pt-1 border-t border-black/5 flex flex-wrap items-center justify-between gap-3">
                            {/* Quick Actions: React & Share with Employees */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveReactionMsgId(
                                    activeReactionMsgId === msg.id ? null : msg.id
                                  )
                                }
                                className="text-[10.5px] font-bold text-gray-500 hover:text-[#008069] px-1.5 py-0.5 rounded hover:bg-black/5 inline-flex items-center gap-0.5 cursor-pointer"
                                title="Reagir com Smile/Emoji"
                              >
                                <Smile className="w-3 h-3" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setForwardModalMsg({
                                    text: msg.text,
                                    attachment: msg.attachment,
                                    attachmentSize: msg.attachmentSize,
                                    mediaType: effectiveMediaType,
                                    mediaUrl: msg.mediaUrl,
                                    audioDuration: msg.audioDuration,
                                    forwardedFrom: msg.senderName,
                                  })
                                }
                                className="text-[10.5px] font-extrabold text-[#008069] hover:bg-[#00A884]/15 px-1.5 py-0.5 rounded inline-flex items-center gap-1 cursor-pointer transition"
                                title="Compartilhar esta mensagem/arquivo com outros funcionários"
                              >
                                <Share2 className="w-3 h-3" />
                                <span>Compartilhar</span>
                              </button>

                              {onTogglePinMessage && (
                                <button
                                  type="button"
                                  onClick={() => onTogglePinMessage(activeThread.id, msg.id)}
                                  className={`text-[10px] px-1 py-0.5 rounded cursor-pointer ${
                                    msg.pinned
                                      ? 'text-amber-700 font-bold'
                                      : 'text-gray-400 hover:text-gray-700'
                                  }`}
                                  title="Fixar mensagem"
                                >
                                  <Pin className="w-3 h-3" />
                                </button>
                              )}

                              {isMe && onDeleteMessage && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteMessage(activeThread.id, msg.id)}
                                  className="text-[10px] text-gray-400 hover:text-red-600 px-1 py-0.5 rounded cursor-pointer"
                                  title="Apagar mensagem"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            {/* Time & Double Check */}
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 ml-auto">
                              <span>{msg.timestamp}</span>
                              {isMe && (
                                <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB] stroke-[2.2]" />
                              )}
                            </div>
                          </div>

                          {/* Quick Reaction Picker Popover */}
                          {activeReactionMsgId === msg.id && (
                            <div className="absolute -top-9 left-2 z-20 bg-white rounded-full shadow-lg border border-gray-200 px-2 py-1 flex items-center gap-1">
                              {['👍', '❤️', '😂', '🚛', '✅', '👏', '🙏'].map((emo) => (
                                <button
                                  key={emo}
                                  type="button"
                                  onClick={() => toggleReaction(msg.id, emo)}
                                  className="hover:scale-125 transition text-sm px-1 cursor-pointer"
                                >
                                  {emo}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Displayed Emoji Reactions Pill */}
                        {reactions.length > 0 && (
                          <div className="flex items-center gap-1 -mt-1.5 z-10 px-2">
                            <div className="bg-white border border-gray-200 rounded-full px-2 py-0.5 shadow-2xs flex items-center gap-1 text-xs">
                              {reactions.map((r, i) => (
                                <span key={i}>{r}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ===============================================================
                  QUICK REPLIES & MEDIA SHORTCUT BAR
              =============================================================== */}
              <div className="px-3 py-1.5 bg-[#F0F2F5] border-t border-gray-200 flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={handleSendSampleVideo}
                  className="text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1 cursor-pointer shadow-2xs shrink-0"
                >
                  <Video className="w-3 h-3" />
                  <span>+ Vídeo Operação</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendSamplePhoto}
                  className="text-[11px] font-extrabold bg-[#008069] hover:bg-[#006b57] text-white px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1 cursor-pointer shadow-2xs shrink-0"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>+ Foto Frota</span>
                </button>
                {[
                  '✅ Recebido, já estamos providenciando!',
                  '🚛 Manifesto e CT-e conferidos e liberados.',
                  '📋 Pode me encaminhar o comprovante por aqui?',
                ].map((quickText) => (
                  <button
                    key={quickText}
                    type="button"
                    onClick={() => setMessageText(quickText)}
                    className="text-[11px] font-semibold bg-white hover:bg-[#D9FDD3] text-[#111B21] px-2.5 py-1 rounded-full border border-gray-200 whitespace-nowrap transition cursor-pointer shrink-0"
                  >
                    {quickText}
                  </button>
                ))}
              </div>

              {/* ===============================================================
                  EMOJI PICKER POPOVER (SMILE)
              =============================================================== */}
              {showEmojiPicker && (
                <div className="bg-white border-t border-gray-200 p-3 shadow-lg z-20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-[#008069] flex items-center gap-1.5">
                      <Smile className="w-4 h-4" />
                      <span>Selecionar Smile / Emoji</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(false)}
                      className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer"
                    >
                      Fechar ✕
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {EMOJI_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                          {cat.label}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.emojis.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => setMessageText((prev) => `${prev}${emoji}`)}
                              className="w-8 h-8 rounded-lg hover:bg-gray-100 text-lg flex items-center justify-center cursor-pointer transition"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===============================================================
                  ATTACHMENT POPOVER (FOTO, VÍDEO, ÁUDIO, DOCUMENTO)
              =============================================================== */}
              {showAttachMenu && (
                <div className="bg-white border-t border-gray-200 p-3 shadow-lg z-20 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs cursor-pointer border border-emerald-200">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Enviar Foto / Imagem</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'image')}
                      className="hidden"
                    />
                  </label>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs cursor-pointer border border-blue-200">
                    <Video className="w-4 h-4 text-blue-600" />
                    <span>Enviar Vídeo</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => handleFileUpload(e, 'video')}
                      className="hidden"
                    />
                  </label>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs cursor-pointer border border-amber-200">
                    <Volume2 className="w-4 h-4 text-amber-600" />
                    <span>Arquivo de Áudio</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => handleFileUpload(e, 'audio')}
                      className="hidden"
                    />
                  </label>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs cursor-pointer border border-purple-200">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <span>Documento (PDF/XLSX)</span>
                    <input
                      type="file"
                      onChange={(e) => handleFileUpload(e, 'document')}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowAttachMenu(false)}
                    className="ml-auto text-xs text-gray-400 hover:text-gray-700 px-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* ===============================================================
                  BOTTOM WHATSAPP COMPOSER OR VOICE RECORDING BAR
              =============================================================== */}
              <div className="bg-[#F0F2F5] px-3 py-2.5 border-t border-gray-200">
                {isRecordingVoice ? (
                  <div className="flex items-center justify-between gap-3 bg-white px-4 py-2 rounded-full border border-red-300 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
                      <Mic className="w-4 h-4 text-red-600" />
                      <span className="text-xs font-extrabold text-red-600 tabular-nums">
                        Gravando voz... {Math.floor(recordingSeconds / 60)}:
                        {recordingSeconds % 60 < 10 ? '0' : ''}
                        {recordingSeconds % 60}
                      </span>
                    </div>

                    {/* Animated bars */}
                    <div className="hidden sm:flex items-center gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((b) => (
                        <span
                          key={b}
                          className="w-1 h-4 bg-red-400 rounded-full animate-pulse"
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelVoiceRecording}
                        className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        <span>Cancelar</span>
                      </button>
                      <button
                        type="button"
                        onClick={finishAndSendVoiceRecording}
                        className="px-4 py-1.5 rounded-full bg-[#00A884] hover:bg-[#008f6f] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Áudio</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {/* Smile / Emoji Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker((v) => !v);
                        setShowAttachMenu(false);
                      }}
                      className={`p-2.5 rounded-full transition cursor-pointer ${
                        showEmojiPicker
                          ? 'bg-[#00A884] text-white'
                          : 'hover:bg-gray-200 text-[#54656F]'
                      }`}
                      title="Inserir Smile / Emoji"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {/* Attach Media Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu((v) => !v);
                        setShowEmojiPicker(false);
                      }}
                      className={`p-2.5 rounded-full transition cursor-pointer ${
                        showAttachMenu
                          ? 'bg-[#00A884] text-white'
                          : 'hover:bg-gray-200 text-[#54656F]'
                      }`}
                      title="Anexar Foto, Vídeo, Áudio ou Documento"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>

                    {/* Text Input */}
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && messageText.trim()) {
                          handleSendText();
                        }
                      }}
                      placeholder={`Mensagem para ${activeThread.name}...`}
                      className="flex-1 bg-white text-xs text-[#111B21] px-4 py-2.5 rounded-full border border-gray-200 focus:outline-none focus:border-[#00A884]"
                    />

                    {/* Voice Record Button OR Send Text Button */}
                    {messageText.trim() ? (
                      <button
                        type="button"
                        onClick={handleSendText}
                        className="w-10 h-10 rounded-full bg-[#00A884] hover:bg-[#008f6f] text-white flex items-center justify-center shrink-0 cursor-pointer shadow-xs transition"
                        title="Enviar mensagem"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        className="px-3.5 h-10 rounded-full bg-[#00A884] hover:bg-[#008f6f] text-white font-extrabold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition"
                        title="Gravar mensagem de voz"
                      >
                        <Mic className="w-4 h-4" />
                        <span className="hidden sm:inline">Gravar Voz</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <p className="text-sm text-gray-500">
                Selecione um funcionário ou grupo ao lado para iniciar a conversa.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          MODAL: COMPARTILHAMENTO FÁCIL ENTRE FUNCIONÁRIOS E GRUPOS (1-CLIQUE)
      ===================================================================== */}
      {forwardModalMsg && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00A884] text-white flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#111B21]">
                    Compartilhar com Funcionários
                  </h3>
                  <p className="text-xs text-gray-500">
                    Selecione os colegas ou grupos para enviar imediatamente sem dificuldade
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForwardModalMsg(null)}
                className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview of what is being shared */}
            <div className="p-3 rounded-xl bg-[#D9FDD3]/60 border border-[#00A884]/30 text-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-[#008069]">
                Conteúdo Selecionado:
              </span>
              <p className="font-semibold text-[#111B21] line-clamp-2">
                {forwardModalMsg.text}
              </p>
              {forwardModalMsg.attachment && (
                <p className="text-[11px] text-[#008069] font-bold">
                  📎 Anexo: {forwardModalMsg.attachment}
                </p>
              )}
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Adicionar comentário (opcional):
              </label>
              <input
                type="text"
                value={forwardCustomNote}
                onChange={(e) => setForwardCustomNote(e.target.value)}
                placeholder="Ex: Pessoal, confiram este áudio/documento..."
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:border-[#00A884]"
              />
            </div>

            {/* Select Employees */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-extrabold text-[#111B21]">
                  Funcionários ({selectedForwardEmpIds.length} selecionados)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedForwardEmpIds(activeEmployees.map((e) => e.id))
                    }
                    className="text-[10.5px] font-bold bg-[#E7FCE3] text-[#008069] px-2.5 py-0.5 rounded-full cursor-pointer"
                  >
                    Marcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedForwardEmpIds([])}
                    className="text-[10.5px] font-bold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {activeEmployees.map((emp) => {
                  const checked = selectedForwardEmpIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer transition ${
                        checked ? 'bg-[#E7FCE3]/60' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={emp.avatar || '/assets/avatar-joao.jpg'}
                          alt={emp.name}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-[#111B21] truncate">
                            {emp.name}
                          </p>
                          <p className="text-[10.5px] text-gray-500 truncate">
                            {emp.roleTitle} • {emp.department}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedForwardEmpIds((prev) =>
                            e.target.checked
                              ? [...prev, emp.id]
                              : prev.filter((id) => id !== emp.id)
                          );
                        }}
                        className="w-4 h-4 accent-[#00A884] rounded cursor-pointer"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Select Groups */}
            <div>
              <span className="block text-xs font-extrabold text-[#111B21] mb-1.5">
                Grupos Corporativos ({selectedForwardGroupIds.length} selecionados)
              </span>
              <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {chats
                  .filter((c) => c.isGroup)
                  .map((grp) => {
                    const checked = selectedForwardGroupIds.includes(grp.id);
                    return (
                      <label
                        key={grp.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition ${
                          checked ? 'bg-[#E7FCE3]/60' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-extrabold text-[#111B21]">{grp.name}</p>
                          <p className="text-[10.5px] text-gray-500">{grp.roleOrDept}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedForwardGroupIds((prev) =>
                              e.target.checked
                                ? [...prev, grp.id]
                                : prev.filter((id) => id !== grp.id)
                            );
                          }}
                          className="w-4 h-4 accent-[#00A884] rounded cursor-pointer"
                        />
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForwardModalMsg(null)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  selectedForwardEmpIds.length === 0 &&
                  selectedForwardGroupIds.length === 0
                }
                onClick={handleConfirmForward}
                className="bg-[#00A884] hover:bg-[#008f6f] disabled:opacity-40 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-md transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  Enviar Agora (
                  {selectedForwardEmpIds.length + selectedForwardGroupIds.length})
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          LIGHTBOX: FULLSCREEN IMAGE / VIDEO VIEWER
      ===================================================================== */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="max-w-3xl w-full bg-[#111B21] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-between text-white border-b border-white/10">
              <span className="text-xs font-extrabold truncate">{lightboxMedia.title}</span>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black">
              {lightboxMedia.type === 'video' ? (
                <video
                  src={lightboxMedia.url}
                  controls
                  autoPlay
                  className="max-h-[75vh] w-full rounded-lg"
                />
              ) : (
                <img
                  src={lightboxMedia.url}
                  alt={lightboxMedia.title}
                  className="max-h-[75vh] object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: CREATE NEW CORPORATE GROUP
      ===================================================================== */}
      {showNewGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-[#111B21]">
                  Criar Novo Grupo no Zap Corporativo
                </h3>
                <p className="text-xs text-gray-500">
                  Reúna colaboradores de um setor ou operação para comunicação rápida
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewGroupModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nome do Grupo *
                </label>
                <input
                  type="text"
                  value={newGroupForm.name}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                  placeholder="Ex: Operação Pátio & Expedição 24h"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Setor</label>
                  <select
                    value={newGroupForm.department}
                    onChange={(e) =>
                      setNewGroupForm({
                        ...newGroupForm,
                        department: e.target.value as Department | 'Todos',
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl"
                  >
                    <option value="Todos">Todos os Setores</option>
                    <option value="Operacional">Operacional</option>
                    <option value="Logística">Logística</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Recursos Humanos">Recursos Humanos</option>
                    <option value="Segurança">Segurança</option>
                    <option value="Diretoria">Diretoria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Descrição Curta
                  </label>
                  <input
                    type="text"
                    value={newGroupForm.roleOrDept}
                    onChange={(e) =>
                      setNewGroupForm({ ...newGroupForm, roleOrDept: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Selecionar Participantes ({newGroupForm.participantIds.length})
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                  {employees.map((emp) => {
                    const checked = newGroupForm.participantIds.includes(emp.id);
                    return (
                      <label
                        key={emp.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-xs cursor-pointer"
                      >
                        <span className="font-bold text-[#111B21]">
                          {emp.name}{' '}
                          <span className="font-normal text-gray-500">
                            • {emp.department}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...newGroupForm.participantIds, emp.id]
                              : newGroupForm.participantIds.filter((id) => id !== emp.id);
                            setNewGroupForm({ ...newGroupForm, participantIds: next });
                          }}
                          className="accent-[#00A884]"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewGroupModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newGroupForm.name.trim()) return;
                  onCreateGroupChat?.(newGroupForm);
                  setShowNewGroupModal(false);
                  triggerToast(`✓ Grupo "${newGroupForm.name}" criado!`);
                }}
                className="bg-[#00A884] hover:bg-[#008f6f] text-white font-extrabold text-xs px-5 py-2 rounded-xl cursor-pointer"
              >
                Criar Grupo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: GROUP PARTICIPANTS
      ===================================================================== */}
      {showGroupMembersModal && activeThread && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-extrabold text-[#111B21]">
                Integrantes — {activeThread.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowGroupMembersModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {employees.map((emp) => {
                const isMember = activeParticipantIds.includes(emp.id);
                return (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between p-2 rounded-xl border border-gray-100 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={emp.avatar || '/assets/avatar-joao.jpg'}
                        alt={emp.name}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                      <div>
                        <p className="font-bold text-[#111B21]">{emp.name}</p>
                        <p className="text-[10px] text-gray-500">{emp.department}</p>
                      </div>
                    </div>
                    {onManageGroupParticipants ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = isMember
                            ? activeParticipantIds.filter((id) => id !== emp.id)
                            : [...activeParticipantIds, emp.id];
                          onManageGroupParticipants(activeThread.id, next);
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer ${
                          isMember
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-[#FFD400] text-[#080B0D]'
                        }`}
                      >
                        {isMember ? '✓ No Grupo' : '+ Adicionar'}
                      </button>
                    ) : (
                      <span className="text-[10.5px] font-bold text-emerald-700">
                        {isMember ? 'Membro' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
