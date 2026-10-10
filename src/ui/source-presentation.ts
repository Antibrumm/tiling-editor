interface SourcePresentationDependencies {
  highlightCode: HTMLElement;
  source: HTMLTextAreaElement;
  highlight: HTMLElement;
}
/**
 * Renders a syntax-highlighted overlay for the injected YAML textarea.
 * Escapes source text before adding markup and synchronizes the overlay's scroll position.
 * Highlighting leaves the editable source and persistent model untouched.
 */
export class SourcePresentation {
  constructor(private dependencies: SourcePresentationDependencies) {
    this.escapeHtml = this.escapeHtml.bind(this);
    this.updateHighlight = this.updateHighlight.bind(this);
  }

  private escapeHtml(value: string) {
    return value.replace(
      /[&<>"]/g,
      (c) =>
        (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c],
    );
  }
  public updateHighlight() {
    this.dependencies.highlightCode.innerHTML =
      this.dependencies.source.value
        .split('\n')
        .map((line) => {
          if (/^\s*#/.test(line))
            return '<span class="syntax-comment">' + this.escapeHtml(line) + '</span>';
          const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:\s*)(.*)$/);
          if (!match) return this.escapeHtml(line);
          const scalar = match[4],
            hs =
              scalar === '|' || scalar === '|-' || scalar === '|+'
                ? '<span class="syntax-punctuation">' + this.escapeHtml(scalar) + '</span>'
                : '<span class="syntax-value">' + this.escapeHtml(scalar) + '</span>';
          return (
            this.escapeHtml(match[1]) +
            '<span class="syntax-attribute">' +
            this.escapeHtml(match[2]) +
            '</span>' +
            this.escapeHtml(match[3]) +
            hs
          );
        })
        .join('\n') + '\n';
    this.dependencies.highlight.scrollTop = this.dependencies.source.scrollTop;
    this.dependencies.highlight.scrollLeft = this.dependencies.source.scrollLeft;
  }
}
