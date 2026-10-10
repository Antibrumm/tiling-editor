interface UiFeedbackDependencies {
  status: HTMLElement;
}
/**
 * Displays temporary messages in an injected status element.
 * Owns a timeout per instance; a new message replaces the previous message and restarts
 * the 3.5-second clearing delay. The bound message method can be used as a callback.
 */
export class UiFeedback {
  constructor(private dependencies: UiFeedbackDependencies) {
    this.message = this.message.bind(this);
  }

  private timer: ReturnType<typeof setTimeout> | undefined;
  public message(value: string) {
    this.dependencies.status.textContent = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.dependencies.status.textContent = '';
    }, 3500);
  }
}
