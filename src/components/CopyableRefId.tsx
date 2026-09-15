'use client';

import React, { useState } from 'react';
import { Copy, Check, Hash } from 'lucide-react';

export interface CopyableRefIdProps {
  id: string;
  displayId?: string;
  showHash?: boolean;
  brackets?: boolean;
  className?: string;
  title?: string;
}

export function CopyableRefId({
  id,
  displayId,
  showHash = false,
  brackets = false,
  className = '',
  title = 'Click to copy ID',
}: CopyableRefIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(id);
      } else if (typeof document !== 'undefined') {
        // Fallback for test / headless environments
        const textArea = document.createElement('textarea');
        textArea.value = id;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy ID', err);
    }
  };

  const text = displayId || id;
  const renderedText = brackets ? `[${text}]` : text;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : title}
      data-testid={`copyable-ref-id-${id}`}
      className={`inline-flex items-center space-x-0.5 font-mono cursor-pointer select-none transition-colors rounded px-1 py-0.5 -mx-1 group hover:bg-slate-800/80 ${
        copied ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-emerald-400'
      } ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-emerald-400 text-[10px]">Copied!</span>
        </>
      ) : (
        <>
          {showHash && (
            <Hash className="w-2.5 h-2.5 text-slate-500 group-hover:text-emerald-400 shrink-0" />
          )}
          <span className={`font-mono shrink-0 ${className}`}>{renderedText}</span>
          <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-slate-400 group-hover:text-emerald-400 shrink-0" />
        </>
      )}
    </button>
  );
}
