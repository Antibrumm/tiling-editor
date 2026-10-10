interface UiFeedbackDependencies {
  status: HTMLElement;
}
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
