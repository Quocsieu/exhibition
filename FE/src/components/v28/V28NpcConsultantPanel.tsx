import React, { useEffect, useRef, useState } from 'react';
import {
  v28Api,
  type V28AudioClip,
  type V28BoothAudioPack,
  type V28BoothPlacementView,
  type V28VoiceSessionInfo,
} from '../../services/v28Api';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';

export interface V28NpcConsultantPanelProps {
  booth: V28BoothPlacementView;
  isMobilePortrait: boolean;
  onAnimStateChange: (state: V28NpcAnimState) => void;
  onClose: () => void;
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
}) => {
  const [tab, setTab] = useState<'audio' | 'chat' | 'voice'>('audio');
  const [audioPack, setAudioPack] = useState<V28BoothAudioPack | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<boolean>(false);
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('');
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'npc',
      text: `Xin chào quý khách! Tôi là Trợ lý AI tư vấn của gian hàng ${booth.boothName} (${booth.companyName}). Quý khách cần tìm hiểu sản phẩm nào?`,
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  const [voiceSession, setVoiceSession] = useState<V28VoiceSessionInfo | null>(null);
  const [voiceRemainingSec, setVoiceRemainingSec] = useState<number>(0);
  const [voiceTranscriptInput, setVoiceTranscriptInput] = useState<string>('');
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string>('');

  const visitorIdRef = useRef<string>(
    sessionStorage.getItem('v28_visitor_uid') ||
      (() => {
        const id = `u-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('v28_visitor_uid', id);
        return id;
      })()
  );

  // Stop audio & end active voice session automatically whenever leaving booth or unmounting!
  const stopAudio = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
      audioElRef.current = null;
    }
    setPlayingClipId(null);
    onAnimStateChange('idle');
  };

  useEffect(() => {
    onAnimStateChange('greet');
    setLoadingAudio(true);
    v28Api
      .getBoothAudio(booth.boothId)
      .then((pack) => setAudioPack(pack))
      .catch(() => setAudioPack(null))
      .finally(() => setLoadingAudio(false));

    return () => {
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth.boothId]);

  useEffect(() => {
    if (!voiceSession) return;
    setVoiceRemainingSec(voiceSession.maxDurationSec);
    const interval = window.setInterval(() => {
      setVoiceRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          v28Api.endVoiceSession(voiceSession.sessionId).catch(() => {});
          setVoiceSession(null);
          setVoiceStatus('Phiên Voice đã tự động kết thúc (hết thời lượng 90 giây).');
          onAnimStateChange('farewell');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(interval);
      v28Api.endVoiceSession(voiceSession.sessionId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSession?.sessionId]);

  const handlePlayClip = (clip: V28AudioClip) => {
    // Single-audio mutex: stop any currently playing clip first
    if (playingClipId === clip.audioId) {
      stopAudio();
      return;
    }
    stopAudio();
    setActiveSubtitle(clip.transcript);
    const audio = new Audio(`${API_BASE}${clip.audioUrl}`);
    audioElRef.current = audio;
    setPlayingClipId(clip.audioId);
    onAnimStateChange(clip.entityType === 'product' ? 'point' : 'talk');
    audio.onended = () => {
      setPlayingClipId(null);
      onAnimStateChange('idle');
    };
    audio.onerror = () => {
      setPlayingClipId(null);
      onAnimStateChange('idle');
    };
    audio.play().catch(() => {
      // Autoplay/playback blocked fallback: keep readable subtitle visible
      setPlayingClipId(null);
      onAnimStateChange('idle');
    });
  };

  const handleSendChat = async (textOverride?: string) => {
    const msg = (textOverride ?? chatInput).trim();
    if (!msg || chatLoading) return;
    setChatMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
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
          meta: `${res.modelId} · ${res.liveGeminiVerified ? 'Live Gemini' : 'Grounded Mock'}`,
        },
      ]);
      onAnimStateChange('talk');
      window.setTimeout(() => onAnimStateChange('idle'), 2200);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'npc', text: `⚠️ ${(err as Error).message}` },
      ]);
      onAnimStateChange('idle');
    } finally {
      setChatLoading(false);
    }
  };

  const handleStartVoice = async () => {
    setVoiceError('');
    setVoiceStatus('Đang khởi tạo phiên Voice...');
    try {
      const { session } = await v28Api.startVoiceSession({
        boothId: booth.boothId,
        userId: visitorIdRef.current,
      });
      setVoiceSession(session);
      setVoiceStatus(
        `Đã kết nối (${session.pipelineMode}) · Còn ${session.remainingSessionsThisHour} phiên/giờ`
      );
      onAnimStateChange('listen');
    } catch (err) {
      setVoiceError((err as Error).message);
      setVoiceStatus('');
    }
  };

  const handleEndVoice = async () => {
    if (!voiceSession) return;
    await v28Api.endVoiceSession(voiceSession.sessionId).catch(() => {});
    setVoiceSession(null);
    setVoiceStatus('Đã kết thúc phiên Voice.');
    onAnimStateChange('farewell');
  };

  const handleVoiceTurn = async () => {
    if (!voiceSession || !voiceTranscriptInput.trim()) return;
    const text = voiceTranscriptInput.trim();
    setVoiceTranscriptInput('');
    setVoiceError('');
    onAnimStateChange('listen');
    try {
      const res = await v28Api.sendVoiceTurn(voiceSession.sessionId, text);
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', text: `🎙️ ${text}` },
        { role: 'npc', text: res.reply, meta: `Voice (${res.pipelineMode})` },
      ]);
      setActiveSubtitle(res.reply);
      onAnimStateChange('talk');
      window.setTimeout(() => onAnimStateChange('listen'), 2000);
    } catch (err) {
      setVoiceError((err as Error).message);
    }
  };

  return (
    <div
      style={{
        pointerEvents: 'auto',
        width: isMobilePortrait ? '100%' : 430,
        maxHeight: isMobilePortrait ? '56dvh' : '68vh',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
        boxShadow: '0 16px 40px rgba(15,23,42,0.32)',
        border: '1px solid #cbd5e1',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header + AI Disclosure */}
      <div style={{ padding: '12px 14px', background: '#0f172a', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
              🤖 TRỢ LÝ AI TƯ VẤN GIAN HÀNG · {booth.companyName}
            </div>
            <strong style={{ fontSize: 15 }}>{booth.boothName}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAudio();
              handleEndVoice();
              onClose();
            }}
            style={{ minWidth: 36, minHeight: 36, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
          Bạn đang tương tác với AI (dữ liệu từ hồ sơ gian hàng). Trạng thái: <strong>LIVE GEMINI NOT VERIFIED</strong> (Chế độ an toàn không phát sinh chi phí).
        </div>
      </div>

      {/* Mode Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        {[
          { id: 'audio', label: '🔊 Audio Giới thiệu' },
          { id: 'chat', label: '💬 AI Chat' },
          { id: 'voice', label: '🎙️ AI Voice' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            style={{
              flex: 1,
              minHeight: 42,
              border: 'none',
              borderBottom: tab === t.id ? '3px solid #0284c7' : '3px solid transparent',
              background: 'transparent',
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#0284c7' : '#475569',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: 12, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tab === 'audio' && (
          <>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Bấm để nghe audio tạo sẵn (có cache theo content hash, không tự phát gây phiền):
            </div>
            {loadingAudio ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Đang tải danh sách audio...</div>
            ) : audioPack ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {audioPack.clips.map((clip) => {
                  const isPlaying = playingClipId === clip.audioId;
                  const label =
                    clip.slotKey === 'welcome'
                      ? '👋 Lời chào mừng gian hàng'
                      : clip.slotKey === 'company_intro'
                      ? '🏢 Giới thiệu Doanh nghiệp'
                      : `📦 Giới thiệu sản phẩm (${clip.slotKey})`;
                  return (
                    <div
                      key={clip.audioId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        background: isPlaying ? '#e0f2fe' : '#fff',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{label}</div>
                      <button
                        type="button"
                        onClick={() => handlePlayClip(clip)}
                        style={{
                          minHeight: 36,
                          padding: '0 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: isPlaying ? '#ef4444' : '#0284c7',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        {isPlaying ? '⏹ Dừng' : '▶ Nghe'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#b91c1c' }}>Không tải được audio cache — hiển thị phụ đề dự phòng.</div>
            )}

            {activeSubtitle && (
              <div style={{ padding: 10, borderRadius: 10, background: '#f1f5f9', fontSize: 13, color: '#0f172a', lineHeight: 1.45 }}>
                <strong>Phụ đề:</strong> {activeSubtitle}
              </div>
            )}
          </>
        )}

        {tab === 'chat' && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Giá sản phẩm?', 'So sánh sản phẩm', 'Có bảo hành không?'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSendChat(q)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '8px 11px',
                    borderRadius: 12,
                    background: m.role === 'user' ? '#0284c7' : '#f1f5f9',
                    color: m.role === 'user' ? '#fff' : '#0f172a',
                    fontSize: 13,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {m.text}
                  {m.meta && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{m.meta}</div>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Hỏi về sản phẩm, giá, liên hệ..."
                style={{ flex: 1, minHeight: 40, padding: '6px 10px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChat()}
                style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Gửi
              </button>
            </div>
          </>
        )}

        {tab === 'voice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#475569', background: '#fef3c7', padding: 10, borderRadius: 10 }}>
              Chế độ thử nghiệm: tối đa <strong>90 giây/phiên</strong>, <strong>3 phiên/giờ</strong>. Khi chưa cấu hình <code>GEMINI_API_KEY</code>, hệ thống sử dụng luồng dự phòng <strong>FALLBACK_STT_CHAT_TTS</strong>.
            </div>
            {voiceError && (
              <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: 8, borderRadius: 8 }}>
                ⚠️ {voiceError}
              </div>
            )}
            {voiceStatus && <div style={{ fontSize: 12, color: '#047857' }}>{voiceStatus}</div>}

            {!voiceSession ? (
              <button
                type="button"
                onClick={handleStartVoice}
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  border: 'none',
                  background: '#0284c7',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                🎙️ Trò chuyện bằng giọng nói
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>
                    🔴 Đang mở phiên · Còn {voiceRemainingSec}s
                  </span>
                  <button
                    type="button"
                    onClick={handleEndVoice}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                  >
                    Kết thúc
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={voiceTranscriptInput}
                    onChange={(e) => setVoiceTranscriptInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVoiceTurn()}
                    placeholder="Nhập hoặc nói nội dung câu hỏi..."
                    style={{ flex: 1, minHeight: 40, padding: '6px 10px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={handleVoiceTurn}
                    style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Nói
                  </button>
                </div>
                {activeSubtitle && (
                  <div style={{ padding: 10, borderRadius: 10, background: '#f1f5f9', fontSize: 13, whiteSpace: 'pre-line' }}>
                    <strong>NPC trả lời:</strong> {activeSubtitle}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
