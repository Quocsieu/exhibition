import React, { useEffect, useMemo, useRef, useState } from 'react';
import { v28Api, type V28BoothPlacementView } from '../../services/v28Api';
import { getNpcAssistantProfile } from '../../services/npcPresentationService';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';

interface ChatMessage {
  role: 'user' | 'npc';
  text: string;
  meta?: string;
}

export interface V28NpcChatModalProps {
  booth: V28BoothPlacementView;
  isMobileUi: boolean;
  onAnimStateChange: (state: V28NpcAnimState) => void;
  onClose: () => void;
}

/**
 * Compact, user-initiated Chat modal for the booth NPC (Phase 1.1).
 * Only opens when the visitor explicitly clicks the "💬 Chat" button.
 * Does NOT render narration controls, subtitles, or auto-start narration audio.
 */
export const V28NpcChatModal: React.FC<V28NpcChatModalProps> = ({
  booth,
  isMobileUi,
  onAnimStateChange,
  onClose,
}) => {
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

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      role: 'npc',
      text: `Xin chào quý khách! Tôi là ${profile.assistantName} (${profile.roleTitle}) của gian hàng ${booth.boothName}. Quý khách cần hỏi thêm thông tin sản phẩm nào?`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const activeBoothIdRef = useRef(booth.boothId);
  activeBoothIdRef.current = booth.boothId;

  const visitorIdRef = useRef<string>(
    sessionStorage.getItem('v28_visitor_uid') ||
      (() => {
        const id = `u-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('v28_visitor_uid', id);
        return id;
      })()
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onAnimStateChange('idle');
    };
  }, [onAnimStateChange]);

  useEffect(() => {
    setChatMessages([
      {
        role: 'npc',
        text: `Xin chào quý khách! Tôi là ${profile.assistantName} (${profile.roleTitle}) của gian hàng ${booth.boothName}. Quý khách cần hỏi thêm thông tin sản phẩm nào?`,
      },
    ]);
    setChatInput('');
    setChatError('');
    setChatLoading(false);
  }, [booth.boothId, booth.boothName, profile.assistantName, profile.roleTitle]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const reqBoothId = booth.boothId;
    setChatMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    setChatError('');
    setChatLoading(true);
    onAnimStateChange('listen');
    try {
      const res = await v28Api.chatWithBoothNpc({
        boothId: reqBoothId,
        userId: visitorIdRef.current,
        message: msg,
      });
      if (!mountedRef.current || activeBoothIdRef.current !== reqBoothId) return;
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'npc',
          text: res.reply,
          meta: res.liveGeminiVerified ? `Gemini Live (${res.modelId})` : undefined,
        },
      ]);
      onAnimStateChange('talk');
    } catch (err) {
      if (!mountedRef.current || activeBoothIdRef.current !== reqBoothId) return;
      setChatError((err as Error).message || 'Không thể kết nối trợ lý tư vấn.');
      onAnimStateChange('idle');
    } finally {
      if (mountedRef.current && activeBoothIdRef.current === reqBoothId) {
        setChatLoading(false);
      }
    }
  };

  return (
    <aside
      data-testid="v28-npc-chat-modal"
      aria-label={`Chat với trợ lý ${profile.assistantName}`}
      style={{
        pointerEvents: 'auto',
        marginLeft: 'auto',
        width: isMobileUi ? '100%' : 'min(380px, 92vw)',
        maxWidth: '100%',
        maxHeight: isMobileUi ? '52vh' : '56vh',
        background: 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 16,
        border: '1px solid #cbd5e1',
        boxShadow: '0 14px 36px rgba(15, 23, 42, 0.28)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          background: '#0f172a',
          color: '#ffffff',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            💬 Chat với {profile.assistantName}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {booth.companyName || booth.boothName}
          </div>
        </div>
        <button
          type="button"
          data-testid="v28-npc-chat-close"
          onClick={onClose}
          aria-label="Đóng cửa sổ chat"
          style={{
            minWidth: 32,
            minHeight: 32,
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.4)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          ✕
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: '#f8fafc',
        }}
      >
        {chatMessages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '86%',
              padding: '8px 10px',
              borderRadius: 12,
              fontSize: 12.5,
              lineHeight: 1.45,
              background: m.role === 'user' ? '#0284c7' : '#ffffff',
              color: m.role === 'user' ? '#ffffff' : '#0f172a',
              border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
            }}
          >
            <div>{m.text}</div>
            {m.meta && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3 }}>{m.meta}</div>}
          </div>
        ))}
        {chatLoading && <div style={{ fontSize: 12, color: '#64748b' }}>⏳ Trợ lý đang trả lời...</div>}
        {chatError && <div style={{ fontSize: 12, color: '#dc2626' }}>⚠️ {chatError}</div>}
      </div>

      <form
        onSubmit={handleSendChat}
        style={{
          display: 'flex',
          gap: 6,
          padding: 8,
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Nhập câu hỏi về sản phẩm..."
          aria-label="Nhập câu hỏi cho trợ lý tư vấn"
          style={{
            flex: 1,
            minHeight: 36,
            padding: '6px 10px',
            borderRadius: 9,
            border: '1px solid #cbd5e1',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={chatLoading || !chatInput.trim()}
          style={{
            minHeight: 36,
            padding: '0 12px',
            borderRadius: 9,
            border: 'none',
            background: '#0284c7',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: chatLoading ? 'wait' : 'pointer',
            opacity: chatLoading || !chatInput.trim() ? 0.6 : 1,
          }}
        >
          Gửi
        </button>
      </form>
    </aside>
  );
};
