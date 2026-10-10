/** Opens a temporary confirmation dialog and invokes the action only after confirmation. */
export class ConfirmationDialog {
  public open(message: string, onConfirm: () => void) {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML =
      '<p></p><div class="confirm-dialog-actions"><button type="button">Cancel</button><button type="button" class="confirm-remove">Remove</button></div>';
    dialog.querySelector('p')!.textContent = message;
    document.body.append(dialog);
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    dialog.querySelector('button')!.onclick = close;
    dialog.querySelector<HTMLButtonElement>('.confirm-remove')!.onclick = () => {
      close();
      onConfirm();
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    dialog.showModal();
  }
}
