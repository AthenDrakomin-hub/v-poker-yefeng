import { useState, useEffect, useRef } from 'react';

/**
 * V-POKER 房间聊天组件
 * 支持文字消息和表情
 */

interface ChatMessage {
  message_id: string;
  user_id: string;
  username: string;
  message_type: 'text' | 'emoji' | 'system';
  content: string;
  created_at: number;
}

interface RoomChatProps {
  userId: string;
  onSendMessage: (message: string, type: 'text' | 'emoji') => void;
}

// 快捷表情
const quickEmojis = [
  '😀', '😂', '😍', '😎', '🤔', '😅',
  '👍', '👎', '👏', '🙏', '💪', '🔥',
  '♠️', '♥️', '♣️', '♦️', '🃏', '💰'
];

export default function RoomChat({ userId, onSendMessage }: RoomChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 监听 WebSocket 消息（这里简化处理，实际由父组件传入）
  const addMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev.slice(-50), msg]); // 最多保留50条
  };

  // 暴露 addMessage 给父组件
  useEffect(() => {
    (window as any).addChatMessage = addMessage;
    return () => {
      delete (window as any).addChatMessage;
    };
  }, []);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim(), 'text');
    setInputValue('');
  };

  const handleEmojiClick = (emoji: string) => {
    onSendMessage(emoji, 'emoji');
    setShowEmojiPanel(false);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-96 glass-card overflow-hidden">
      {/* 聊天头部 */}
      <div className="p-3 border-b border-white/10 bg-white/5">
        <h3 className="text-vp-gold font-semibold">💬 房间聊天</h3>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-vp-text-muted text-sm py-8">
            暂无消息，快来发言吧
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.message_id} className="text-sm">
              {msg.message_type === 'system' ? (
                <div className="text-center text-vp-text-muted text-xs py-1">
                  {msg.content}
                </div>
              ) : (
                <div className={`flex ${msg.user_id === userId ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-1.5 ${
                    msg.user_id === userId
                      ? 'bg-vp-gold/20 border border-vp-gold/30'
                      : 'bg-white/10'
                  }`}>
                    <div className="text-xs text-vp-text-muted mb-0.5">
                      {msg.user_id === userId ? '我' : msg.username}
                      <span className="ml-2">{formatTime(msg.created_at)}</span>
                    </div>
                    <div className={msg.message_type === 'emoji' ? 'text-xl' : ''}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 表情面板 */}
      {showEmojiPanel && (
        <div className="p-2 border-t border-white/10 bg-white/5">
          <div className="grid grid-cols-9 gap-1">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="text-xl p-1 hover:bg-white/10 rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <button
            onClick={() => setShowEmojiPanel(!showEmojiPanel)}
            className="px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            😊
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="发送消息..."
            className="flex-1 px-3 py-2 bg-white/10 rounded-lg border border-white/20 focus:border-vp-gold/50 outline-none text-sm"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-vp-gold/20 border border-vp-gold/50 rounded-lg text-vp-gold hover:bg-vp-gold/30 transition-colors text-sm font-medium"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
