import React, { useEffect, useMemo, useRef, useState } from 'react';
import { v28Api, type V28BoothPlacementView, type V28Product } from '../../services/v28Api';
import { getNpcAssistantProfile } from '../../services/npcPresentationService';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';

interface ChatMessage {
  role: 'user' | 'npc';
  text: string;
  meta?: string;
}

const MAX_STORED_CHAT_MESSAGES = 50;

function getChatStorageKey(boothId: string): string {
  return `v28_npc_chat_history_${boothId}`;
}

function loadBoothChatHistory(boothId: string): ChatMessage[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(getChatStorageKey(boothId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = parsed.filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        (m.role === 'user' || m.role === 'npc') &&
        typeof m.text === 'string' &&
        m.text.length > 0
    );
    return valid.length > 0 ? valid.slice(-MAX_STORED_CHAT_MESSAGES) : null;
  } catch {
    return null;
  }
}

function saveBoothChatHistory(boothId: string, messages: readonly ChatMessage[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const trimmed = messages.slice(-MAX_STORED_CHAT_MESSAGES);
    localStorage.setItem(getChatStorageKey(boothId), JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota/private mode errors
  }
}

export interface V28NpcChatModalProps {
  booth: V28BoothPlacementView;
  product?: V28Product | null;
  isMobileUi: boolean;
  onAnimStateChange: (state: V28NpcAnimState) => void;
  onClose: () => void;
}

/**
 * Compact, user-initiated Chat modal for the booth NPC (Phase 1.1 + Phase A).
 * Only opens when the visitor explicitly clicks the "Chat" button.
 * Persists conversation history per booth across close/exit and reload.
 */
export const V28NpcChatModal: React.FC<V28NpcChatModalProps> = ({
  booth,
  product = null,
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

  const buildGreeting = (targetProduct: V28Product | null): string => {
    if (targetProduct) {
      const priceLabel =
        targetProduct.price > 0
          ? `${targetProduct.price.toLocaleString('vi-VN')} ${targetProduct.currency || 'VND'}`
          : 'liên hệ báo giá';
      return `Xin chào quý khách! Tôi là ${profile.assistantName} tại gian hàng ${booth.boothName}. Quý khách cần hỏi thêm gì về sản phẩm "${targetProduct.name}" (${priceLabel}) ạ?`;
    }
    return `Xin chào quý khách! Tôi là ${profile.assistantName} (${profile.roleTitle}) của gian hàng ${booth.boothName}. Quý khách cần hỏi thêm thông tin sản phẩm nào?`;
  };

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = loadBoothChatHistory(booth.boothId);
    if (saved) return saved;
    return [
      {
        role: 'npc',
        text: buildGreeting(product),
      },
    ];
  });
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const contextKey = `${booth.boothId}::${product?.id || ''}`;
  const activeContextKeyRef = useRef(contextKey);
  activeContextKeyRef.current = contextKey;

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

  // Load persisted history when switching to another booth (never wipe existing history on reopen)
  useEffect(() => {
    const saved = loadBoothChatHistory(booth.boothId);
    if (saved) {
      setChatMessages(saved);
    } else {
      setChatMessages([
        {
          role: 'npc',
          text: buildGreeting(product),
        },
      ]);
    }
    setChatInput('');
    setChatError('');
    setChatLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth.boothId]);

  // Persist messages whenever chatMessages changes
  useEffect(() => {
    if (chatMessages.length > 0) {
      saveBoothChatHistory(booth.boothId, chatMessages);
    }
  }, [booth.boothId, chatMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const reqContextKey = contextKey;
    const reqBoothId = booth.boothId;
    const reqProductId = product?.id;
    setChatMessages((prev) => {
      const next: ChatMessage[] = [...prev, { role: 'user', text: msg }];
      saveBoothChatHistory(reqBoothId, next);
      return next;
    });
    setChatInput('');
    setChatError('');
    setChatLoading(true);
    onAnimStateChange('listen');
    try {
      const res = await v28Api.chatWithBoothNpc({
        boothId: reqBoothId,
        productId: reqProductId,
        userId: visitorIdRef.current,
        message: msg,
      });
      if (!mountedRef.current || activeContextKeyRef.current !== reqContextKey) return;
      setChatMessages((prev) => {
        const next: ChatMessage[] = [
          ...prev,
          {
            role: 'npc',
            text: res.reply,
            meta: res.liveGeminiVerified ? `Gemini Live (${res.modelId})` : undefined,
          },
        ];
        saveBoothChatHistory(reqBoothId, next);
        return next;
      });
      onAnimStateChange('talk');
    } catch (err) {
      if (!mountedRef.current || activeContextKeyRef.current !== reqContextKey) return;
      setChatError((err as Error).message || 'Không thể kết nối trợ lý tư vấn.');
      onAnimStateChange('idle');
    } finally {
      if (mountedRef.current && activeContextKeyRef.current === reqContextKey) {
        setChatLoading(false);
      }
    }
  };

  return (
    <aside
      data-testid="v28-npc-chat-modal"
      data-product-id={product?.id || ''}
      aria-label={`Chat với trợ lý ${profile.assistantName}`}
      style={{
        pointerEvents: 'auto',
        marginLeft: 'auto',
        width: '100%',
        maxWidth: '100%',
        height: isMobileUi ? 'auto' : '100%',
        maxHeight: isMobileUi ? '42vh' : '100%',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 13,
        border: '1px solid #cbd5e1',
        boxShadow: '0 10px 26px rgba(15, 23, 42, 0.24)',
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
          gap: 6,
          padding: '7px 10px',
          background: '#0f172a',
          color: '#ffffff',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            💬 Chat với {profile.assistantName}
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {product ? `SP: ${product.name}` : booth.companyName || booth.boothName}
          </div>
        </div>
        <button
          type="button"
          data-testid="v28-npc-chat-close"
          onClick={onClose}
          aria-label="Đóng cửa sổ chat"
          style={{
            minWidth: 26,
            minHeight: 26,
            borderRadius: 7,
            border: '1px solid rgba(148,163,184,0.4)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 12,
            flexShrink: 0,
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
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: '#f8fafc',
        }}
      >
        {chatMessages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              padding: '6px 8px',
              borderRadius: 10,
              fontSize: 11.5,
              lineHeight: 1.4,
              background: m.role === 'user' ? '#0284c7' : '#ffffff',
              color: m.role === 'user' ? '#ffffff' : '#0f172a',
              border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
            }}
          >
            <div>{m.text}</div>
            {m.meta && <div style={{ fontSize: 9.5, opacity: 0.65, marginTop: 2 }}>{m.meta}</div>}
          </div>
        ))}
        {chatLoading && <div style={{ fontSize: 11, color: '#64748b' }}>⏳ Trợ lý đang trả lời...</div>}
        {chatError && <div style={{ fontSize: 11, color: '#dc2626' }}>⚠️ {chatError}</div>}
      </div>

      <form
        onSubmit={handleSendChat}
        style={{
          display: 'flex',
          gap: 5,
          padding: 6,
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Nhập câu hỏi..."
          aria-label="Nhập câu hỏi cho trợ lý tư vấn"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 30,
            padding: '4px 8px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={chatLoading || !chatInput.trim()}
          style={{
            minHeight: 30,
            padding: '0 10px',
            borderRadius: 8,
            border: 'none',
            background: '#0284c7',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 11.5,
            cursor: chatLoading ? 'wait' : 'pointer',
            opacity: chatLoading || !chatInput.trim() ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          Gửi
        </button>
      </form>
    </aside>
  );
};
