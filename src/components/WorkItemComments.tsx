'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  Bold,
  Italic,
  Code,
  Quote,
  List,
  Eye,
  Edit3,
  Trash2,
  Clock,
  User,
  AlertCircle,
} from 'lucide-react';
import type { WorkItemComment } from '@/types/tracker';
import { getItemComments, addComment, deleteComment } from '@/app/actions/commentActions';

export interface WorkItemCommentsProps {
  itemId: string;
  currentUser?: { full_name?: string; email?: string };
  isReadOnly?: boolean;
  onCommentCountChange?: (count: number) => void;
  initialComments?: WorkItemComment[];
}

/**
 * Lightweight, safe Markdown renderer for discussion comments.
 * Handles code blocks, inline code, bold, italic, quotes, lists, and links.
 */
export function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';

  const renderInline = (text: string): React.ReactNode[] => {
    // Process inline markdown: `code`, **bold**, *italic*, [text](url)
    const tokens: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // 1. Inline code `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push(
          <code
            key={keyIdx++}
            className="px-1.5 py-0.5 text-xs font-mono bg-slate-800 text-emerald-400 rounded border border-slate-700/60"
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // 2. Bold **bold**
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        tokens.push(
          <strong key={keyIdx++} className="font-semibold text-slate-100">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // 3. Italic *italic* or _italic_
      const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/);
      if (italicMatch) {
        tokens.push(
          <em key={keyIdx++} className="italic text-slate-200">
            {italicMatch[2]}
          </em>
        );
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // 4. Link [text](url)
      const linkMatch = remaining.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      if (linkMatch) {
        tokens.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 break-all"
          >
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // 5. Normal text character
      const nextSpecial = remaining.search(/[`*_\[]/);
      if (nextSpecial === -1) {
        tokens.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        tokens.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        tokens.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return tokens;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check code fence
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`codeblock-${i}`}
            className="my-2 p-3 bg-slate-950/90 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto custom-scrollbar"
          >
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-1.5 pl-3 border-l-2 border-emerald-500/60 text-slate-300 italic text-xs"
        >
          {renderInline(line.replace(/^>\s?/, ''))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (line.match(/^(\*|-)\s+/)) {
      elements.push(
        <div key={`li-${i}`} className="flex items-start space-x-2 my-0.5 text-xs text-slate-200">
          <span className="text-emerald-400 mt-0.5">•</span>
          <span className="flex-1">{renderInline(line.replace(/^(\*|-)\s+/, ''))}</span>
        </div>
      );
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const match = line.match(/^(\d+)\.\s+/);
      const num = match ? match[1] : '1';
      elements.push(
        <div key={`oli-${i}`} className="flex items-start space-x-2 my-0.5 text-xs text-slate-200">
          <span className="text-emerald-400 font-mono text-[11px] shrink-0">{num}.</span>
          <span className="flex-1">{renderInline(line.replace(/^\d+\.\s+/, ''))}</span>
        </div>
      );
      continue;
    }

    // Normal paragraph line
    if (line.trim() === '') {
      elements.push(<div key={`spacer-${i}`} className="h-2" />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="text-xs text-slate-200 leading-relaxed my-0.5 break-words">
          {renderInline(line)}
        </p>
      );
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre
        key="codeblock-unclosed"
        className="my-2 p-3 bg-slate-950/90 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto custom-scrollbar"
      >
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 30) return 'just now';
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateString;
  }
}

export function WorkItemComments({
  itemId,
  currentUser,
  isReadOnly = false,
  onCommentCountChange,
  initialComments,
}: WorkItemCommentsProps) {
  const [comments, setComments] = useState<WorkItemComment[]>(initialComments || []);
  const [isLoading, setIsLoading] = useState(!initialComments);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const activeItemIdRef = useRef<string>(itemId);

  const authorDisplayName =
    currentUser?.full_name ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
    'You';

  const fetchComments = async (id: string) => {
    activeItemIdRef.current = id;
    setIsLoading(true);
    setSubmitError(null);
    try {
      const res = await getItemComments(id);
      if (activeItemIdRef.current !== id) return;
      if (res.success && res.data) {
        setComments(res.data);
        if (onCommentCountChange) {
          onCommentCountChange(res.data.length);
        }
      } else if (res.error) {
        setSubmitError(res.error);
      }
    } catch (err: any) {
      if (activeItemIdRef.current === id) {
        setSubmitError(err?.message || 'Failed to load comments');
      }
    } finally {
      if (activeItemIdRef.current === id) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    activeItemIdRef.current = itemId;
    if (itemId) {
      setComments([]);
      fetchComments(itemId);
    } else {
      setComments([]);
    }
  }, [itemId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commentText.trim() || isSubmitting || isReadOnly) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await addComment(itemId, commentText, authorDisplayName);
      if (!res.success || !res.data) {
        setSubmitError(res.error || 'Failed to post comment');
        return;
      }

      const newComments = [...comments, res.data];
      setComments(newComments);
      setCommentText('');
      setPreviewMode(false);

      if (onCommentCountChange) {
        onCommentCountChange(newComments.length);
      }

      // Smooth scroll feed to bottom
      setTimeout(() => {
        if (typeof feedEndRef.current?.scrollIntoView === 'function') {
          feedEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (isReadOnly || deletingId) return;
    setDeletingId(commentId);
    try {
      const res = await deleteComment(commentId);
      if (res.success) {
        const next = comments.filter((c) => c.id !== commentId);
        setComments(next);
        if (onCommentCountChange) {
          onCommentCountChange(next.length);
        }
      } else if (res.error) {
        setSubmitError(res.error);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to delete comment');
    } finally {
      setDeletingId(null);
    }
  };

  // Helper to inject Markdown formatting into textarea
  const insertFormatting = (prefix: string, suffix: string = '') => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = commentText.substring(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;

    const newText =
      commentText.substring(0, start) + replacement + commentText.substring(end);
    setCommentText(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected ? selected.length : 4)
      );
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4" data-testid="work-item-comments-container">
      {/* Discussion Timeline Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Discussion Feed
            </h3>
            <span
              data-testid="comments-count-badge"
              className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700/60"
            >
              {comments.length}
            </span>
          </div>
          {isLoading && (
            <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading feed...</span>
            </span>
          )}
        </div>

        {submitError && (
          <div
            data-testid="comments-error-banner"
            className="p-3 bg-red-950/70 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center space-x-2 animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Empty State Card */}
        {!isLoading && comments.length === 0 && (
          <div
            data-testid="comments-empty-state"
            className="flex flex-col items-center justify-center p-8 bg-slate-950/50 border border-slate-800/70 rounded-xl text-center space-y-2"
          >
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
              <MessageSquare className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-xs font-medium text-slate-300">No comments yet</p>
            <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
              Start the discussion, leave design notes, or record execution updates on this work item.
            </p>
          </div>
        )}

        {/* Chronological Comments Feed */}
        {comments.length > 0 && (
          <div
            data-testid="comments-feed-list"
            className="space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1"
          >
            {comments.map((c) => {
              const initial = (c.author_name || 'U').charAt(0).toUpperCase();
              return (
                <div
                  key={c.id}
                  data-testid={`comment-row-${c.id}`}
                  className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl hover:border-slate-700/70 transition-colors space-y-2 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {initial}
                      </div>
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {c.author_name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[10px] text-slate-500 flex items-center space-x-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-600" />
                        <span>{formatRelativeTime(c.created_at)}</span>
                      </span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          disabled={deletingId === c.id}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity rounded cursor-pointer"
                          title="Delete comment"
                          data-testid={`delete-comment-${c.id}`}
                        >
                          {deletingId === c.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 pl-8">
                    <MarkdownRenderer content={c.content} />
                  </div>
                </div>
              );
            })}
            <div ref={feedEndRef} />
          </div>
        )}
      </div>

      {/* Comment Input Box with Markdown Toolbar */}
      {!isReadOnly && (
        <form
          onSubmit={handleSubmit}
          className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 focus-within:border-emerald-500/70 transition-colors"
          data-testid="add-comment-form"
        >
          {/* Markdown Formatting Toolbar */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center space-x-1 text-slate-400">
              <button
                type="button"
                onClick={() => insertFormatting('**', '**')}
                className="p-1 rounded hover:text-white hover:bg-slate-800 transition-colors text-xs"
                title="Bold (**text**)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('*', '*')}
                className="p-1 rounded hover:text-white hover:bg-slate-800 transition-colors text-xs"
                title="Italic (*text*)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('`', '`')}
                className="p-1 rounded hover:text-white hover:bg-slate-800 transition-colors text-xs"
                title="Inline Code (`code`)"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('```\n', '\n```')}
                className="p-1 rounded hover:text-white hover:bg-slate-800 transition-colors text-xs"
                title="Code Block (```)"
              >
                <span className="font-mono text-[10px] px-1 font-bold">{'{}'}</span>
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('> ')}
                className="p-1 rounded hover:text-white hover:bg-slate-800 transition-colors text-xs"
                title="Quote (> text)"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('- ')}
                className="p-1 rounded hover:text-white hover:bg-slate-800 transition-colors text-xs"
                title="Bullet List (- item)"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setPreviewMode(!previewMode)}
                className={`flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded transition-colors ${
                  previewMode
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {previewMode ? (
                  <>
                    <Edit3 className="w-3 h-3" />
                    <span>Write</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Preview</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Input Area / Preview Area */}
          {previewMode ? (
            <div
              data-testid="comment-preview-area"
              className="min-h-[72px] p-2 bg-slate-900/50 rounded-lg border border-slate-800/50 text-xs text-slate-300"
            >
              {commentText.trim() ? (
                <MarkdownRenderer content={commentText} />
              ) : (
                <span className="text-slate-500 italic">Nothing to preview</span>
              )}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Leave a comment... (supports Markdown, Ctrl+Enter to post)"
              data-testid="comment-input-textarea"
              className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none resize-none leading-relaxed"
            />
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
            <span className="hidden sm:inline">
              Ctrl+Enter or Cmd+Enter to submit
            </span>
            <button
              type="submit"
              disabled={!commentText.trim() || isSubmitting}
              data-testid="submit-comment-btn"
              className="ml-auto inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Posting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Comment</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
export default WorkItemComments;
