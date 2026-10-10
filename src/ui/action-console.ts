/** Displays a bounded, timestamped action history in an injected DOM element. */
export class ActionConsole {
  constructor(private element: HTMLElement) {}
  log(message: string) {
    const line = document.createElement('div');
    line.className = 'action-console-line';
    const now = new Date();
    const stamp = ([now.getHours(), now.getMinutes(), now.getSeconds()] as const)
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
    line.textContent = stamp + '  ' + message;
    this.element.appendChild(line);
    while (this.element.children.length > 80) this.element.removeChild(this.element.firstChild!);
    this.element.scrollTop = this.element.scrollHeight;
  }
  clear() {
    this.element.textContent = '';
  }
}
