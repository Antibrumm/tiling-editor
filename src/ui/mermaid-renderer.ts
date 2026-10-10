import type { Mermaid } from 'mermaid';

type DiagramEngine = Pick<Mermaid, 'initialize' | 'render'>;

/** Lazily renders Markdown Mermaid blocks, preserving source on errors and ignoring stale views. */
export class MermaidRenderer {
  private engine?: Promise<DiagramEngine>;
  private nextId = 0;

  constructor(
    private loadEngine: () => Promise<DiagramEngine> = async () =>
      (await import('mermaid')).default,
  ) {}

  public async render(container: HTMLElement): Promise<void> {
    const blocks = container.querySelectorAll<HTMLElement>('pre > code.language-mermaid');
    if (!blocks.length) return;
    this.engine ??= this.loadEngine().then((engine) => {
      engine.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        suppressErrorRendering: true,
      });
      return engine;
    });
    for (const code of blocks) {
      const source = code.parentElement!;
      if (!container.contains(source)) continue;
      const diagram = document.createElement('figure');
      diagram.className = 'mermaid-diagram';
      diagram.setAttribute('aria-busy', 'true');
      diagram.textContent = 'Rendering diagram…';
      source.replaceWith(diagram);
      try {
        const engine = await this.engine;
        if (!container.contains(diagram) || !diagram.isConnected) continue;
        const { svg } = await engine.render(
          `documentation-diagram-${++this.nextId}`,
          code.textContent || '',
          diagram,
        );
        if (!container.contains(diagram) || !diagram.isConnected) continue;
        diagram.innerHTML = svg;
        const graphic = diagram.querySelector('svg');
        if (graphic?.viewBox.baseVal.width) {
          // Keep labels readable; wide diagrams scroll inside the documentation pane.
          graphic.style.width = `${graphic.viewBox.baseVal.width}px`;
          graphic.style.maxWidth = 'none';
        }
      } catch {
        if (!container.contains(diagram)) continue;
        const message = document.createElement('p');
        message.className = 'mermaid-error';
        message.setAttribute('role', 'status');
        message.textContent = 'This diagram could not be rendered. Its source is shown below.';
        diagram.replaceChildren(message, source);
      } finally {
        diagram.removeAttribute('aria-busy');
      }
    }
  }
}
