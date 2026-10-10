import userDocumentation from '../../docs/user.md?raw';
import architectureDocumentation from '../../docs/architecture.md?raw';
import developerDocumentation from '../../docs/developer.md?raw';
import { getElement } from '../dom';
import { renderMarkdown } from './markdown';
import { MermaidRenderer } from './mermaid-renderer';

export function initializeDocumentation(): void {
  const diagrams = new MermaidRenderer();
  const documents = [
    { id: 'user', title: 'User documentation', source: userDocumentation },
    { id: 'architecture', title: 'Architecture documentation', source: architectureDocumentation },
    { id: 'developer', title: 'Developer documentation', source: developerDocumentation },
  ];
  const dialog = getElement('help-dialog');
  const content = getElement('help-dialog-content');
  const title = getElement('help-dialog-title');
  const back = getElement('documentation-back');
  const close = getElement('close-help');
  const showList = () => {
    title.textContent = 'Documentation';
    back.hidden = true;
    const list = document.createElement('ul');
    list.className = 'documentation-list';
    for (const entry of documents) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.document = entry.id;
      button.textContent = entry.title;
      button.addEventListener('click', () => {
        title.textContent = entry.title;
        content.innerHTML = renderMarkdown(entry.source);
        content.scrollTop = 0;
        back.hidden = false;
        back.focus();
        void diagrams.render(content);
      });
      item.append(button);
      list.append(item);
    }
    content.replaceChildren(list);
    content.scrollTop = 0;
  };
  getElement('open-help').addEventListener('click', () => {
    showList();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  back.addEventListener('click', () => {
    showList();
    content.querySelector('button')?.focus();
  });
  close.addEventListener('click', () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close.click();
  });
}
