import { memo, useEffect, useRef, useState } from 'react';
import { Prose } from './Prose';
import { Button } from '@/components/ui/button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type AuthState = {
  status: 'disconnected' | 'waiting' | 'connected' | 'error';
  verificationUri?: string;
  userCode?: string;
  error?: string;
};

type ChatMessage = { role: 'user' | 'assistant'; text: string };

const Message = memo(function Message({
  message,
  pending,
}: {
  message: ChatMessage;
  pending: boolean;
}) {
  return (
    <div className="text-sm">
      <span className="font-semibold">{message.role === 'user' ? 'You' : 'Codex'}: </span>
      {message.role === 'user' ? (
        <span className="whitespace-pre-wrap">{message.text}</span>
      ) : message.text ? (
        <Prose className="inline">{message.text}</Prose>
      ) : (
        pending && 'Thinking…'
      )}
    </div>
  );
});

function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const [input, setInput] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    onSend(text);
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      {/* ponytail: field-sizing does the auto-grow natively; no measure-and-set-height effect.
          Browsers without it (Firefox < 140) just get a fixed 2-row box. */}
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) submit(event);
        }}
        rows={2}
        placeholder="Ask Codex… (Shift+Enter for a new line)"
        className="max-h-48 flex-1 resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm field-sizing-content"
      />
      {busy ? <Button type="button" variant="outline" onClick={onStop}><span className="size-2.5 rounded-sm bg-current"/>Stop</Button> : <Button type="submit">Send</Button>}
    </form>
  );
}

export function Chat() {
  const [auth, setAuth] = useState<AuthState>({ status: 'disconnected' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sessionId = useRef(crypto.randomUUID());
  const activeResponse = useRef<AbortController | null>(null);
  useEffect(() => () => activeResponse.current?.abort(), []);

  async function refreshAuth() {
    const response = await fetch(`${API_URL}/api/auth/codex`);
    if (!response.ok) throw new Error('Could not check ChatGPT sign-in');
    setAuth((await response.json()) as AuthState);
  }

  useEffect(() => {
    refreshAuth().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, []);

  useEffect(() => {
    if (auth.status !== 'waiting') return;
    const timer = window.setInterval(() => void refreshAuth(), 1500);
    return () => window.clearInterval(timer);
  }, [auth.status]);

  async function signIn() {
    setError('');
    const loginWindow = window.open('about:blank', '_blank');
    try {
      const response = await fetch(`${API_URL}/api/auth/codex/start`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not start ChatGPT sign-in');
      const next = (await response.json()) as AuthState;
      setAuth(next);
      if (next.verificationUri) {
        if (loginWindow) loginWindow.location.href = next.verificationUri;
        else window.open(next.verificationUri, '_blank', 'noopener,noreferrer');
      } else {
        loginWindow?.close();
      }
    } catch (cause) {
      loginWindow?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function signOut() {
    await fetch(`${API_URL}/api/auth/codex`, { method: 'DELETE' });
    setAuth({ status: 'disconnected' });
    setMessages([]);
  }

  async function send(text: string) {
    const history: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages([...history, { role: 'assistant', text: '' }]);
    setBusy(true);
    setError('');
    const controller = new AbortController();
    activeResponse.current = controller;
    let reply = '';

    try {
      const response = await fetch(`${API_URL}/api/codex/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId.current,
        },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Chat failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', text: reply }]);
      }
      reply += decoder.decode();
      setMessages([...history, { role: 'assistant', text: reply }]);
    } catch (cause) {
      if (controller.signal.aborted) setMessages(reply ? [...history, { role: 'assistant', text: reply }] : history);
      else { setMessages(history); setError(cause instanceof Error ? cause.message : String(cause)); }
    } finally {
      if (activeResponse.current === controller) activeResponse.current = null;
      setBusy(false);
    }
  }

  function stopResponse() { activeResponse.current?.abort(); }

  if (auth.status !== 'connected') {
    return (
      <div className="flex max-w-lg flex-col items-start gap-4">
        <h1 className="text-3xl font-bold">Chat with Codex</h1>
        <p className="text-sm text-muted-foreground">
          Connect a ChatGPT Plus or Pro account to use Codex without an API key.
        </p>
        {auth.status === 'waiting' && auth.userCode ? (
          <div className="w-full rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Enter this code in the sign-in page:</p>
            <div className="mt-2 flex items-center gap-3">
              <code className="rounded bg-muted px-3 py-2 text-lg font-semibold tracking-wider">
                {auth.userCode}
              </code>
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(auth.userCode!)}
              >
                Copy
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Waiting for sign-in…</p>
          </div>
        ) : (
          <Button onClick={signIn}>Sign in with ChatGPT</Button>
        )}
        {(error || auth.error) && <p className="text-sm text-destructive">{error || auth.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chat with Codex</h1>
          <p className="text-sm text-muted-foreground">Connected through ChatGPT</p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>

      <div className="flex min-h-48 flex-col gap-3 rounded-lg border bg-card p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Ask Codex anything.</p>
        )}
        {messages.map((message, index) => (
          <Message key={index} message={message} pending={busy && index === messages.length - 1} />
        ))}
      </div>

      <Composer busy={busy} onSend={(text) => void send(text)} onStop={stopResponse} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
