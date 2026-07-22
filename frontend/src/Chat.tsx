import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: `${API_URL}/api/chat` }),
  });

  const busy = status === 'submitted' || status === 'streaming';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="text-3xl font-bold">Chat</h1>

      <div className="flex flex-col gap-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-semibold">{m.role === 'user' ? 'You' : 'AI'}: </span>
            {/* v7 messages are part arrays, not a content string */}
            {m.parts.map((part, i) =>
              part.type === 'text' ? <span key={i}>{part.text}</span> : null
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={busy}>
          Send
        </Button>
      </form>
    </div>
  );
}
