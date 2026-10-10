import userDocumentation from '../../docs/user.md?raw';
import developerDocumentation from '../../docs/developer.md?raw';
import { getElement } from '../dom';
import { renderMarkdown } from './markdown';

export function initializeDocumentation(): void {
  const documents = [
    {
      dialog: getElement('help-dialog'),
      content: getElement('help-dialog-content'),
      open: getElement('open-help'),
      close: getElement('close-help'),
      source: userDocumentation,
    },
    {
      dialog: getElement('dev-help-dialog'),
      content: getElement('dev-help-dialog-content'),
      open: getElement('open-dev-help'),
      close: getElement('close-dev-help'),
      source: developerDocumentation,
    },
  ];

  for (const { dialog, content, open, close, source } of documents) {
    open.addEventListener('click', () => {
      content.innerHTML = renderMarkdown(source);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    close.addEventListener('click', () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close.click();
    });
  }
}
