import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false }), {
    USE_PROFILES: { html: true },
  });
}
