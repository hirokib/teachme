import { memo, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type AuthState = {
  status: 'disconnected' | 'waiting' | 'connected' | 'error';
  verificationUri?: string;
  userCode?: string;
  error?: string;
};

type ChatMessage = { role: 'user' | 'assistant'; text: string };

function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const id = useRef(`mermaid-${crypto.randomUUID()}`);

  useEffect(() => {
    let cancelled = false;
    // ponytail: debounce — mid-stream every chunk re-renders a differently sized SVG,
    // and the resulting height changes make the whole conversation jump.
    const timer = setTimeout(() => {
      void (async () => {
        // ponytail: dynamic import — mermaid is ~500kB and most chats never draw a diagram
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false });
        // ponytail: half-streamed diagrams don't parse; keep the last good render (or the
        // source) until they do. parse() first because render() leaves an orphaned error
        // SVG on <body> when it throws.
        if (!(await mermaid.parse(code, { suppressErrors: true }))) return;
        try {
          const rendered = await mermaid.render(id.current, code);
          if (!cancelled) setSvg(rendered.svg);
        } catch {
          document.getElementById(`d${id.current}`)?.remove();
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  return svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <>{code}</>;
}

// Module scope on purpose: a fresh object here is a fresh component type on every
// render, which remounts Mermaid and flashes the diagram.
const MARKDOWN_COMPONENTS = {
  code: ({ className, children, ...props }: React.ComponentProps<'code'>) =>
    className === 'language-mermaid' ? (
      <Mermaid code={String(children).trimEnd()} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    ),
};

const MARKDOWN_PLUGINS = [remarkGfm];

const PROSE =
  'markdown inline [&_:first-child]:mt-0 [&_:last-child]:mb-0 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5';

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
        <div className={PROSE}>
          <Markdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
            {message.text}
          </Markdown>
        </div>
      ) : (
        pending && 'Thinking…'
      )}
    </div>
  );
});

function Composer({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
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
      <Button type="submit" disabled={busy}>
        Send
      </Button>
    </form>
  );
}

export function Chat() {
  const [auth, setAuth] = useState<AuthState>({ status: 'disconnected' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sessionId = useRef(crypto.randomUUID());

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

    try {
      const response = await fetch(`${API_URL}/api/codex/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId.current,
        },
        body: JSON.stringify({ messages: history }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Chat failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', text: reply }]);
      }
      reply += decoder.decode();
      setMessages([...history, { role: 'assistant', text: reply }]);
    } catch (cause) {
      setMessages(history);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

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

      <Composer busy={busy} onSend={(text) => void send(text)} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
