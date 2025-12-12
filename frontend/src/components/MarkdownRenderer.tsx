'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} rel="noopener noreferrer" target="_blank" />
          ),
          img: ({ node, ...props }) => (
            <img {...props} alt={props.alt ?? ''} className="markdown-image" />
          )
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
