import { memo, useMemo, type ReactNode } from 'react';

/** Renders assistant/user text with preserved newlines and light markdown (fenced + inline code). */
export function renderRichText(content: string): ReactNode {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/i, '');
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-xl border border-[color:var(--sf-border-soft)] bg-white/10 px-4 py-3 text-[12px] leading-[1.6] text-[color:var(--sf-text-2)]"
        >
          <code className="font-mono whitespace-pre">{code}</code>
        </pre>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded-md border border-[color:var(--sf-border-soft)] bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-[color:var(--sf-text-2)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    );
  });
}

export const RichTextContent = memo(function RichTextContent({ content }: { content: string }) {
  const node = useMemo(() => renderRichText(content), [content]);
  return <>{node}</>;
});
