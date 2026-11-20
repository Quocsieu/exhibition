import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  v28Api,
  type V28AiStatusResponse,
  type V28AudioClip,
  type V28BoothAudioPack,
  type V28BoothPlacementView,
  type V28Product,
} from '../../services/v28Api';
import { getNpcAssistantProfile } from '../../services/npcPresentationService';
import { formatCurrency } from '../ProductPanel';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';

export interface V28NpcConsultantPanelProps {
  booth: V28BoothPlacementView;
  isMobilePortrait: boolean;
  onAnimStateChange: (state: V28NpcAnimState) => void;
  onClose: () => void;
  onInspectProduct?: (product: V28Product, slotId: string) => void;
}

type PresentationStatus = 'GREETING' | 'PRESENTING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'ERROR';

interface PresentationStep {
  stepIndex: number;
  type: 'GREETING' | 'PRODUCT' | 'CLOSING';
  slotKey: string;
  slotLabel: string | null;
  product: V28Product | null;
  productIndex: number | null;
  totalProducts: number;
  fallbackText: string;
}

interface ChatMessage {
  role: 'user' | 'npc';
  text: string;
  meta?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const V28NpcConsultantPanel: React.FC<V28NpcConsultantPanelProps> = ({
  booth,
  isMobilePortrait,
  onAnimStateChange,
  onClose,
  onInspectProduct,
}) => {
  const [activeTab, setActiveTab] = useState<'intro' | 'chat'>('intro');

  // Authentic V27.5 NPC Persona (same name & role title as the 3D SalesAssistantNpc standing at this booth!)
  const profile = useMemo(
    () =>
      getNpcAssistantProfile({
        id: booth.boothId,
        name: booth.boothName,
        category: booth.category,
        color: booth.color,
      }),
    [booth.boothId, booth.boothName, booth.category, booth.color]
  );

  // Build V27.5-compatible step sequence: Greeting -> Product 1..N -> Closing
  const steps = useMemo<PresentationStep[]>(() => {
    const validSlots = booth.slots.filter((s) => Boolean(s.product));
    const totalProducts = validSlots.length;
    const list: PresentationStep[] = [
      {
        stepIndex: 0,
        type: 'GREETING',
        slotKey: 'welcome',
        slotLabel: null,
        product: null,
        productIndex: null,
        totalProducts,
        fallbackText: `Xin chào quý khách đến với gian hàng ${booth.boothName} của ${booth.companyName} tại ${booth.zoneName}. Tôi là ${profile.assistantName}, rất hân hạnh được giới thiệu các sản phẩm trưng bày tới quý khách.`,
      },
    ];

    validSlots.forEach((s, idx) => {
      const p = s.product!;
      const priceStr =
        p.price > 0
          ? `Giá niêm yết ${formatCurrency(p.price, p.currency)}.`
          : 'Quý khách vui lòng liên hệ gian hàng để nhận báo giá chi tiết.';
      list.push({
        stepIndex: list.length,
        type: 'PRODUCT',
        slotKey: s.slotId,
        slotLabel: `Kệ trưng bày #${idx + 1}`,
        product: p,
        productIndex: idx + 1,
        totalProducts,
        fallbackText: `Sản phẩm ${p.name}. ${priceStr} ${p.description || ''}`.trim(),
      });
    });

    list.push({
      stepIndex: list.length,
      type: 'CLOSING',
      slotKey: 'closing',
      slotLabel: null,
      product: null,
      productIndex: null,
      totalProducts,
      fallbackText: `Cảm ơn quý khách đã tham quan gian hàng ${booth.boothName} của ${booth.companyName}. Nếu quý khách cần tư vấn thêm, vui lòng chuyển sang tab Chat để trò chuyện trực tiếp với tôi.`,
    });

    return list;
  }, [booth, profile.assistantName]);

  // Presentation & Pre-generated Cached Audio Player State
  const [audioPack, setAudioPack] = useState<V28BoothAudioPack | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<boolean>(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [status, setStatus] = useState<PresentationStatus>('GREETING');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const activeClipKeyRef = useRef<string | null>(null);
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;

  // Chat State (preserved when switching tabs within the same booth consultation session!)
  const [aiStatus, setAiStatus] = useState<V28AiStatusResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string>('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const visitorIdRef = useRef<string>(
    sessionStorage.getItem('v28_visitor_uid') ||
      (() => {
        const id = `u-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('v28_visitor_uid', id);
        return id;
      })()
  );

  // Helper: map step -> pre-generated cached clip
  const getClipForStep = useCallback(
    (step: PresentationStep | undefined): V28AudioClip | null => {
      if (!audioPack || !step) return null;
      return audioPack.clips.find((c) => c.slotKey === step.slotKey) || null;
    },
    [audioPack]
  );

  const stopAudioElement = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.onplay = null;
      audioElRef.current.onpause = null;
      audioElRef.current.onended = null;
      audioElRef.current.onerror = null;
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
      audioElRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore speechSynthesis cancel error
      }
    }
    activeClipKeyRef.current = null;
    setIsAudioPlaying(false);
  }, []);

  const playStepAudio = useCallback(
    (stepIdx: number, packOverride?: V28BoothAudioPack | null) => {
      const step = steps[stepIdx];
      if (!step) return;
      const pack = packOverride !== undefined ? packOverride : audioPack;
      const clip = pack?.clips.find((c) => c.slotKey === step.slotKey) || null;

      stopAudioElement();
      setAudioError(null);
      setStatus(step.type === 'GREETING' ? 'GREETING' : 'PRESENTING');
      onAnimStateChange(
        step.type === 'GREETING' ? 'greet' : step.type === 'PRODUCT' ? 'point' : 'talk'
      );

      if (isMutedRef.current) {
        setIsAudioPlaying(false);
        return;
      }

      const advanceToNext = () => {
        setIsAudioPlaying(false);
        if (stepIdx < steps.length - 1) {
          const nextIdx = stepIdx + 1;
          setCurrentStepIndex(nextIdx);
          playStepAudio(nextIdx, pack);
        } else {
          setStatus('COMPLETED');
          onAnimStateChange('idle');
        }
      };

      // Mode 1: Real pre-generated Gemini TTS WAV cached on backend -> play cached WAV directly (0 Gemini calls!)
      if (pack?.liveGeminiTtsEnabled && clip && clip.status === 'ready') {
        const audio = new Audio(`${API_BASE}${clip.audioUrl}`);
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.muted = isMutedRef.current;
        audioElRef.current = audio;
        activeClipKeyRef.current = `${booth.boothId}:${step.slotKey}:${clip.audioId}`;

        audio.onplay = () => setIsAudioPlaying(true);
        audio.onpause = () => setIsAudioPlaying(false);
        audio.onended = advanceToNext;
        audio.onerror = () => {
          const code = audio.error?.code;
          setIsAudioPlaying(false);
          setAudioError(
            `Không thể tải tệp âm thanh đã lưu (mã lỗi media: ${code ?? 'unknown'}). Hệ thống đang hiển thị phụ đề tiếng Việt.`
          );
          onAnimStateChange('idle');
        };

        audio.play().catch(() => {
          setIsAudioPlaying(false);
        });
        return;
      }

      // Mode 2: Zero-cost Vietnamese fallback when LIVE GEMINI TTS is not yet configured -> Web Speech vi-VN
      const speechText = clip?.transcript || step.fallbackText;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && speechText) {
        try {
          const utter = new SpeechSynthesisUtterance(speechText);
          utter.lang = 'vi-VN';
          utter.rate = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
          if (viVoice) utter.voice = viVoice;
          utter.onstart = () => setIsAudioPlaying(true);
          utter.onend = advanceToNext;
          utter.onerror = () => {
            setIsAudioPlaying(false);
          };
          activeClipKeyRef.current = `${booth.boothId}:${step.slotKey}:speech-fallback`;
          window.speechSynthesis.speak(utter);
          return;
        } catch {
          // fall through to cached WAV fallback
        }
      }

      // Mode 3: Direct cached WAV playback fallback if speechSynthesis is unavailable
      if (clip && clip.status === 'ready') {
        const audio = new Audio(`${API_BASE}${clip.audioUrl}`);
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.muted = isMutedRef.current;
        audioElRef.current = audio;
        audio.onplay = () => setIsAudioPlaying(true);
        audio.onpause = () => setIsAudioPlaying(false);
        audio.onended = advanceToNext;
        audio.onerror = () => {
          const code = audio.error?.code;
          setIsAudioPlaying(false);
          setAudioError(
            `Không thể tải tệp âm thanh đã lưu (mã lỗi media: ${code ?? 'unknown'}). Hệ thống đang hiển thị phụ đề tiếng Việt.`
          );
          onAnimStateChange('idle');
        };
        audio.play().catch(() => setIsAudioPlaying(false));
      }
    },
    [audioPack, booth.boothId, onAnimStateChange, steps, stopAudioElement]
  );

  // Initialize booth consultation when booth changes
  useEffect(() => {
    stopAudioElement();
    setActiveTab('intro');
    setCurrentStepIndex(0);
    setStatus('GREETING');
    setAudioError(null);
    setLoadingAudio(true);
    setChatError('');
    setChatMessages([
      {
        role: 'npc',
        text: `Xin chào quý khách! Tôi là ${profile.assistantName} (${profile.roleTitle}) của gian hàng ${booth.boothName} (${booth.companyName}). Quý khách cần tìm hiểu thông tin sản phẩm nào?`,
      },
    ]);

    let cancelled = false;
    v28Api
      .getBoothAudio(booth.boothId)
      .then((pack) => {
        if (cancelled) return;
        setAudioPack(pack);
        setLoadingAudio(false);
        playStepAudio(0, pack);
      })
      .catch(() => {
        if (cancelled) return;
        setAudioPack(null);
        setLoadingAudio(false);
        setAudioError('Tạm thời chưa tải được tệp audio cache. Quý khách vẫn có thể đọc phụ đề giới thiệu.');
      });

    v28Api
      .getAiStatus()
      .then((st) => {
        if (!cancelled) setAiStatus(st);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      stopAudioElement();
      onAnimStateChange('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth.boothId]);

  // Auto-scroll chat history
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeTab, chatMessages]);

  // Playback Controls (Exact V27.5 behavior)
  const handlePause = () => {
    if (audioElRef.current && !audioElRef.current.paused) {
      audioElRef.current.pause();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    setIsAudioPlaying(false);
    setStatus('PAUSED');
    onAnimStateChange('idle');
  };

  const handleResume = () => {
    const step = steps[currentStepIndex];
    if (!step) return;
    setStatus(step.type === 'GREETING' ? 'GREETING' : 'PRESENTING');
    onAnimStateChange(step.type === 'PRODUCT' ? 'point' : 'talk');
    if (audioElRef.current && !isMuted) {
      audioElRef.current.play().catch(() => {
        playStepAudio(currentStepIndex);
      });
    } else {
      playStepAudio(currentStepIndex);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex <= 0) return;
    const prevIdx = currentStepIndex - 1;
    setCurrentStepIndex(prevIdx);
    playStepAudio(prevIdx);
  };

  const handleNext = () => {
    if (currentStepIndex >= steps.length - 1) return;
    const nextIdx = currentStepIndex + 1;
    setCurrentStepIndex(nextIdx);
    playStepAudio(nextIdx);
  };

  const handleStop = () => {
    stopAudioElement();
    setStatus('CANCELLED');
    onAnimStateChange('idle');
  };

  const handleRestart = () => {
    setCurrentStepIndex(0);
    playStepAudio(0);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (audioElRef.current) {
      audioElRef.current.muted = nextMuted;
      if (nextMuted) {
        audioElRef.current.pause();
        setIsAudioPlaying(false);
      } else if (status === 'GREETING' || status === 'PRESENTING') {
        audioElRef.current.play().catch(() => {});
      }
    } else if (!nextMuted && (status === 'GREETING' || status === 'PRESENTING')) {
      playStepAudio(currentStepIndex);
    }
  };

  // Switching Tabs: Pause audio cleanly when entering Chat, keep position & history!
  const handleSwitchTab = (nextTab: 'intro' | 'chat') => {
    if (nextTab === activeTab) return;
    if (nextTab === 'chat' && (status === 'GREETING' || status === 'PRESENTING')) {
      if (audioElRef.current && !audioElRef.current.paused) {
        audioElRef.current.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
      setIsAudioPlaying(false);
      setStatus('PAUSED');
      onAnimStateChange('idle');
    }
    setActiveTab(nextTab);
  };

  const handleClosePanel = () => {
    stopAudioElement();
    onAnimStateChange('idle');
    onClose();
  };

  // Grounded AI Chat Handler
  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    setChatError('');
    setChatLoading(true);
    onAnimStateChange('listen');
    try {
      const res = await v28Api.chatWithBoothNpc({
        boothId: booth.boothId,
        userId: visitorIdRef.current,
        message: msg,
      });
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'npc',
          text: res.reply,
          meta: res.liveGeminiVerified
            ? `Gemini Live (${res.modelId})`
            : `Grounded Mock (${res.modelId} · LIVE GEMINI NOT VERIFIED)`,
        },
      ]);
      onAnimStateChange('talk');
    } catch (err) {
      const errMsg = (err as Error).message || 'Không thể kết nối trợ lý tư vấn.';
      setChatError(errMsg);
      onAnimStateChange('idle');
    } finally {
      setChatLoading(false);
    }
  };

  const currentStep = steps[Math.min(Math.max(0, currentStepIndex), steps.length - 1)];
  const currentClip = getClipForStep(currentStep);
  const activeProduct = currentStep?.product ?? null;
  const totalProducts = currentStep?.totalProducts ?? 0;

  const isSessionRunning = status === 'GREETING' || status === 'PRESENTING';
  const isPaused = status === 'PAUSED';
  const isFinishedOrStopped = status === 'COMPLETED' || status === 'CANCELLED';
  const canGoPrevious = currentStepIndex > 0;
  const canGoNext = currentStepIndex < steps.length - 1;

  const statusLabel = (() => {
    if (loadingAudio) return '⏳ Đang tải audio đã lưu...';
    if (status === 'PAUSED') return '⏸️ Đang tạm dừng thuyết minh';
    if (status === 'COMPLETED') return '✅ Đã hoàn tất giới thiệu gian hàng';
    if (status === 'CANCELLED') return '⏹️ Đã dừng thuyết minh';
    if (currentStep?.type === 'GREETING') {
      return isAudioPlaying ? '🔊 Đang phát lời chào mừng' : '👋 Chào mừng khách tham quan (Phụ đề)';
    }
    if (currentStep?.type === 'PRODUCT' && currentStep.productIndex) {
      return isAudioPlaying
        ? `🔊 Đang thuyết minh SP ${currentStep.productIndex}/${totalProducts}`
        : `📝 Giới thiệu sản phẩm ${currentStep.productIndex}/${totalProducts} (Phụ đề)`;
    }
    return isAudioPlaying ? '🔊 Lời cảm ơn & kết thúc' : '✨ Lời cảm ơn & kết thúc (Phụ đề)';
  })();

  const productCounterBadge =
    currentStep?.type === 'PRODUCT' && currentStep.productIndex
      ? `Sản phẩm ${currentStep.productIndex}/${totalProducts}`
      : totalProducts > 0
        ? `${totalProducts} sản phẩm trưng bày`
        : 'Chưa có sản phẩm';

  return (
    <aside
      className="npc-assistant-panel"
      style={{
        '--npc-accent': booth.color || '#0ea5e9',
        position: 'relative',
        bottom: 'auto',
        left: 'auto',
        transform: 'none',
        width: isMobilePortrait ? '100%' : 'min(450px, 92vw)',
        maxWidth: '100%',
        pointerEvents: 'auto',
      } as React.CSSProperties}
      aria-label={`Trợ lý ảo giới thiệu gian hàng ${booth.boothName}`}
    >
      {/* Top Accent Strip (Exact V27.5) */}
      <div className="npc-assistant-panel__strip" />

      {/* Header: Avatar, Name, Role Badge, Company Name & Close Button (Exact V27.5 — preserved across tabs!) */}
      <header className="npc-assistant-panel__header">
        <div className="npc-assistant-panel__persona">
          <div
            className={`npc-assistant-panel__avatar ${
              isAudioPlaying ? 'npc-assistant-panel__avatar--speaking' : ''
            }`}
            aria-hidden="true"
          >
            👩‍💼
          </div>
          <div className="npc-assistant-panel__persona-info">
            <div className="npc-assistant-panel__name-row">
              <strong className="npc-assistant-panel__name">{profile.assistantName}</strong>
              <span className="npc-assistant-panel__role-badge">{profile.roleTitle}</span>
            </div>
            <div className="npc-assistant-panel__booth-name">
              📍 {booth.companyName || booth.boothName}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="npc-assistant-panel__close-btn"
          onClick={handleClosePanel}
          aria-label="Đóng bảng giới thiệu của trợ lý ảo"
          title="Đóng (Dừng thuyết minh)"
        >
          ✕
        </button>
      </header>

      {/* Compact Tab Bar matching existing panel style: Giới thiệu | Chat */}
      <div
        role="tablist"
        aria-label="Chế độ tư vấn NPC"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          padding: '6px 14px 4px',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'intro'}
          onClick={() => handleSwitchTab('intro')}
          style={{
            padding: '7px 10px',
            borderRadius: 10,
            border: activeTab === 'intro' ? '1px solid var(--npc-accent, #0ea5e9)' : '1px solid rgba(148,163,184,0.35)',
            background: activeTab === 'intro' ? 'var(--npc-accent, #0ea5e9)' : 'rgba(255,255,255,0.65)',
            color: activeTab === 'intro' ? '#fff' : '#334155',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          🎙️ Giới thiệu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          onClick={() => handleSwitchTab('chat')}
          style={{
            padding: '7px 10px',
            borderRadius: 10,
            border: activeTab === 'chat' ? '1px solid var(--npc-accent, #0ea5e9)' : '1px solid rgba(148,163,184,0.35)',
            background: activeTab === 'chat' ? 'var(--npc-accent, #0ea5e9)' : 'rgba(255,255,255,0.65)',
            color: activeTab === 'chat' ? '#fff' : '#334155',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          💬 Chat
        </button>
      </div>

      {/* TAB 1: GIỚI THIỆU (100% V27.5 UX & Controls + Pre-generated Cached Audio) */}
      {activeTab === 'intro' && (
        <>
          <div className="npc-assistant-panel__status-bar">
            <span
              className={`npc-status-pill ${
                isSessionRunning
                  ? 'npc-status-pill--active'
                  : isPaused
                    ? 'npc-status-pill--paused'
                    : 'npc-status-pill--idle'
              }`}
            >
              {statusLabel}
            </span>
            <span className="npc-counter-pill">{productCounterBadge}</span>
          </div>

          {audioError && !isMuted && (
            <div className="npc-assistant-panel__audio-warning" role="alert">
              <strong>⚠️ Chế độ phụ đề tiếng Việt</strong>
              <span>{audioError}</span>
              <div>
                <button
                  type="button"
                  className="npc-ctrl-btn"
                  style={{ marginTop: 4, flex: 'none', padding: '4px 10px', fontSize: '0.74rem' }}
                  onClick={() => playStepAudio(currentStepIndex)}
                >
                  🔄 Thử lại âm thanh
                </button>
              </div>
            </div>
          )}

          <div className="npc-assistant-panel__subtitle-box" role="status" aria-live="polite">
            <p className="npc-assistant-panel__subtitle-text">
              “{currentClip?.transcript || currentStep?.fallbackText || ''}”
            </p>
            {audioPack && !audioPack.liveGeminiTtsEnabled && (
              <div style={{ marginTop: 4, fontSize: 10.5, color: '#64748b' }}>
                Audio Cache: Local Fallback WAV (LIVE GEMINI TTS NOT VERIFIED · {audioPack.cacheHits} cache hit)
              </div>
            )}
          </div>

          {activeProduct && (
            <div className="npc-assistant-panel__product-card">
              {activeProduct.images?.[0] ? (
                <img
                  src={activeProduct.images[0]}
                  alt={activeProduct.name}
                  className="npc-assistant-panel__product-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="npc-assistant-panel__product-placeholder">📦</div>
              )}

              <div className="npc-assistant-panel__product-info">
                <div className="npc-assistant-panel__product-slot">
                  {currentStep?.slotKey.toUpperCase()} · {currentStep?.slotLabel}
                </div>
                <strong className="npc-assistant-panel__product-title">{activeProduct.name}</strong>
                {activeProduct.price > 0 && (
                  <div className="npc-assistant-panel__product-price">
                    {formatCurrency(activeProduct.price, activeProduct.currency)}
                  </div>
                )}
              </div>

              {onInspectProduct && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm npc-assistant-panel__inspect-btn"
                  onClick={() => onInspectProduct(activeProduct, currentStep.slotKey)}
                  title="Mở hộp thoại thông tin chi tiết của sản phẩm này"
                >
                  🔍 Chi tiết
                </button>
              )}
            </div>
          )}

          {steps.length > 1 && (
            <div className="npc-assistant-panel__progress" aria-label="Tiến độ thuyết minh">
              {steps.map((s) => {
                const isCurrent = s.stepIndex === currentStepIndex;
                const isDone = s.stepIndex < currentStepIndex;
                return (
                  <span
                    key={s.stepIndex}
                    className={`npc-progress-dot ${
                      isCurrent ? 'npc-progress-dot--current' : isDone ? 'npc-progress-dot--done' : ''
                    }`}
                    title={
                      s.type === 'GREETING'
                        ? 'Chào mừng'
                        : s.type === 'CLOSING'
                          ? 'Kết thúc'
                          : `Sản phẩm ${s.productIndex}: ${s.product?.name || ''}`
                    }
                  />
                );
              })}
            </div>
          )}

          <div
            className="npc-assistant-panel__controls"
            role="group"
            aria-label="Điều khiển thuyết minh sản phẩm"
          >
            <button
              type="button"
              className="npc-ctrl-btn"
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              title="Quay lại bước / sản phẩm trước"
              aria-label="Trước"
            >
              ⏮ Trước
            </button>

            {isPaused ? (
              <button
                type="button"
                className="npc-ctrl-btn npc-ctrl-btn--primary"
                onClick={handleResume}
                title="Tiếp tục thuyết minh"
                aria-label="Tiếp tục"
              >
                ▶ Tiếp tục
              </button>
            ) : isFinishedOrStopped ? (
              <button
                type="button"
                className="npc-ctrl-btn npc-ctrl-btn--primary"
                onClick={handleRestart}
                title="Nghe giới thiệu lại từ đầu"
                aria-label="Nghe lại"
              >
                🔄 Nghe lại
              </button>
            ) : (
              <button
                type="button"
                className="npc-ctrl-btn npc-ctrl-btn--primary"
                onClick={handlePause}
                title="Tạm dừng thuyết minh"
                aria-label="Tạm dừng"
              >
                ⏸ Tạm dừng
              </button>
            )}

            <button
              type="button"
              className="npc-ctrl-btn"
              onClick={handleNext}
              disabled={!canGoNext}
              title="Chuyển sang sản phẩm tiếp theo"
              aria-label="Tiếp"
            >
              Tiếp ⏭
            </button>

            <button
              type="button"
              className="npc-ctrl-btn npc-ctrl-btn--danger"
              onClick={handleStop}
              disabled={isFinishedOrStopped}
              title="Dừng hẳn phiên thuyết minh hiện tại"
              aria-label="Dừng"
            >
              ⏹ Dừng
            </button>

            <button
              type="button"
              className={`npc-ctrl-btn ${isMuted ? 'npc-ctrl-btn--muted' : ''}`}
              onClick={handleToggleMute}
              aria-pressed={isMuted}
              title={isMuted ? 'Bật giọng đọc tiếng Việt' : 'Tắt tiếng (Chỉ hiện phụ đề)'}
              aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {isMuted ? '🔇 Bật tiếng' : '🔊 Tắt tiếng'}
            </button>
          </div>
        </>
      )}

      {/* TAB 2: CHAT (Grounded Booth & Company Consultant inside same panel frame) */}
      {activeTab === 'chat' && (
        <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: 11,
              color: '#475569',
              background: '#f1f5f9',
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            {aiStatus?.liveGeminiVerified
              ? `✅ AI Gemini Live đang hoạt động · Chỉ tư vấn dữ liệu thực của ${booth.companyName}`
              : `ℹ️ Chế độ Grounded Mock (LIVE GEMINI NOT VERIFIED) · Chỉ dùng dữ liệu thật của ${booth.companyName}`}
          </div>

          <div
            ref={chatScrollRef}
            style={{
              maxHeight: isMobilePortrait ? 200 : 230,
              minHeight: 150,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 8,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            {chatMessages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  padding: '8px 11px',
                  borderRadius: 11,
                  background: m.role === 'user' ? 'var(--npc-accent, #0ea5e9)' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#0f172a',
                  border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div>{m.text}</div>
                {m.meta && (
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{m.meta}</div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                ⏳ {profile.assistantName} đang tra cứu hồ sơ gian hàng...
              </div>
            )}
          </div>

          {chatError && (
            <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: '6px 10px', borderRadius: 8 }}>
              ⚠️ {chatError}
            </div>
          )}

          <form onSubmit={handleSendChat} style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={400}
              placeholder="Hỏi về sản phẩm, giá, tình trạng hàng..."
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 11px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--npc-accent, #0ea5e9)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Gửi
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
