"use client";

import { ReactNode } from "react";

/**
 * Renders the small slice of Markdown that chat models actually emit:
 * **bold**, *italic*, `code`, headings, and ordered/unordered lists.
 *
 * Everything is built as React elements rather than an HTML string, so model
 * output can never inject markup. That rules out dangerouslySetInnerHTML and
 * makes a full Markdown dependency unnecessary for this use.
 */

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;
    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong className="font-black text-white" key={key}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[.85em]"
          key={key}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
// Requires whitespace after the marker, so a line opening with **bold** is not a bullet.
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = paragraph;
    paragraph = [];
    blocks.push(
      <p className="leading-6" key={`p${key++}`}>
        {content.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {inline(line, `p${key}-${i}`)}
          </span>
        ))}
      </p>,
    );
  };

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    list = null;
    const className = ordered
      ? "list-decimal space-y-1 pl-5 leading-6 marker:font-bold marker:text-neon"
      : "list-disc space-y-1 pl-5 leading-6 marker:text-neon";
    const children = items.map((item, i) => (
      <li key={i}>{inline(item, `l${key}-${i}`)}</li>
    ));
    blocks.push(
      ordered ? (
        <ol className={className} key={`l${key++}`}>
          {children}
        </ol>
      ) : (
        <ul className={className} key={`l${key++}`}>
          {children}
        </ul>
      ),
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p className="font-black text-white" key={`h${key++}`}>
          {inline(heading[2], `h${key}`)}
        </p>,
      );
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      flushParagraph();
      if (!list?.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    const unordered = UNORDERED.exec(line);
    if (unordered) {
      flushParagraph();
      if (list && list.ordered) flushList();
      if (!list) list = { ordered: false, items: [] };
      list.items.push(unordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}
