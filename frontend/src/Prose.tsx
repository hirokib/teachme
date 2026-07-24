import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const [expanded, setExpanded] = useState(false);
  const id = useRef(`mermaid-${crypto.randomUUID()}`);
  const diagramCode = code.replace(/\$([^$\n]+)\$/g, '$1');

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
        if (!(await mermaid.parse(diagramCode, { suppressErrors: true }))) return;
        try {
          const rendered = await mermaid.render(id.current, diagramCode);
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
  }, [diagramCode]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  if (!svg) return <>{diagramCode}</>;

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-zoom-in rounded-md text-left"
        onClick={() => setExpanded(true)}
        aria-label="Expand diagram"
        title="Click to expand"
      >
        <span dangerouslySetInnerHTML={{ __html: svg }} />
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded diagram"
          onMouseDown={() => setExpanded(false)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-[95vw] overflow-auto rounded-2xl bg-card p-8 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="sticky left-full top-0 z-10 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium"
              onClick={() => setExpanded(false)}
            >
              Close
            </button>
            <div
              className="mt-4 min-w-[900px] [&_svg]:h-auto [&_svg]:w-full [&_svg]:!max-w-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
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

function TableBlock({ children, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="my-2 max-w-full overflow-x-auto rounded-md border" tabIndex={0}>
      <table {...props} className="min-w-max">
        {children}
      </table>
    </div>
  );
}

// Module scope on purpose: a fresh object here is a fresh component type on every
// render, which remounts Mermaid and flashes the diagram.
const MARKDOWN_COMPONENTS = {
  pre: CodeBlock,
  table: TableBlock,
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

function renderableMarkdown(md: string): string {
  const converted = toDollarMath(md).replace(
    /[ \t]*\$\$[ \t]*/g,
    () => '\n\n$$\n\n'
  );
  const displayDelimiters = [...converted.matchAll(/\$\$/g)];
  if (displayDelimiters.length % 2 === 1) {
    return `${converted.slice(0, displayDelimiters[displayDelimiters.length - 1]?.index)}\n\n_Formatting equation…_`;
  }
  const inlineDelimiters = [...converted.matchAll(/(?<!\$)\$(?!\$)/g)];
  if (inlineDelimiters.length % 2 === 1) {
    return `${converted.slice(0, inlineDelimiters[inlineDelimiters.length - 1]?.index)} _Formatting expression…_`;
  }
  return converted;
}

const PROSE =
  'markdown min-w-0 max-w-full overflow-hidden [&_:first-child]:mt-0 [&_:last-child]:mb-0 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_.katex]:inline-block [&_.katex]:max-w-full [&_.katex]:overflow-x-auto [&_.katex]:align-bottom [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5';

export function Prose({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ? `${PROSE} ${className}` : PROSE}>
      <Markdown
        remarkPlugins={MARKDOWN_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {renderableMarkdown(children)}
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
        {renderableMarkdown(children)}
      </Markdown>
    </span>
  );
}
