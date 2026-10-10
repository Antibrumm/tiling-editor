export class RenderScheduler {
  pending: boolean;
  constructor(public render: () => void) {
    this.render = render;
    this.pending = false;
  }
  request() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.render();
    });
  }
}
