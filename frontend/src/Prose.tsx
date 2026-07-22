import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export function Prose({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ? `${PROSE} ${className}` : PROSE}>
      <Markdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
        {children}
      </Markdown>
    </div>
  );
}
