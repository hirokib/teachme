import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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
          // ponytail: swallow — the last good SVG (or the source) stays on screen
        } finally {
          // mermaid measures in a <div id="d{id}"> on <body> and only cleans it up on a
          // clean success; anything else leaves a white box floating over the page.
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

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function CodeBlock({ children, ...props }: React.ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false);
  const code = nodeText(children).replace(/\n$/, '');
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return <div className="group/code relative"><button type="button" onClick={() => void copy()} className="absolute right-2 top-2 z-10 rounded-md border bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground opacity-100 shadow-sm backdrop-blur transition hover:text-foreground sm:opacity-0 sm:focus:opacity-100 sm:group-hover/code:opacity-100" aria-label="Copy code">{copied ? 'Copied' : 'Copy'}</button><pre {...props}>{children}</pre></div>;
}

// Module scope on purpose: a fresh object here is a fresh component type on every
// render, which remounts Mermaid and flashes the diagram.
const MARKDOWN_COMPONENTS = {
  pre: CodeBlock,
  code: ({ className, children, ...props }: React.ComponentProps<'code'>) =>
    className === 'language-mermaid' ? (
      <Mermaid code={String(children).trimEnd()} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    ),
};

const INLINE_MARKDOWN_COMPONENTS = {
  ...MARKDOWN_COMPONENTS,
  p: ({ children }: React.ComponentProps<'p'>) => <>{children}</>,
};

const MARKDOWN_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

// The model writes LaTeX with \( \) and \[ \]; remark-math only knows $ and $$.
// Markdown also eats the backslashes, so \(x\) reaches the page as a bare "(x)".
const toDollarMath = (md: string) =>
  md.replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$').replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');

const PROSE =
  'markdown [&_:first-child]:mt-0 [&_:last-child]:mb-0 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_.katex]:whitespace-nowrap [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5';

export function Prose({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ? `${PROSE} ${className}` : PROSE}>
      <Markdown
        remarkPlugins={MARKDOWN_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {toDollarMath(children)}
      </Markdown>
    </div>
  );
}

export function MathText({ children, className }: { children: string; className?: string }) {
  return (
    <span className={className}>
      <Markdown
        remarkPlugins={MARKDOWN_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={INLINE_MARKDOWN_COMPONENTS}
      >
        {toDollarMath(children)}
      </Markdown>
    </span>
  );
}
