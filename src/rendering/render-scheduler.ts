/**
 * Coalesces repeated render requests into one animation-frame callback.
 * Owns the pending flag and invokes an injected render function when the frame arrives.
 * Requests raised during rendering can schedule the following frame.
 */
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
