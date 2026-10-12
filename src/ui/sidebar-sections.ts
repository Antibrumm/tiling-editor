/** Opens the selected controls and their ancestors, closing unrelated sidebar sections. */
export class SidebarSections {
  public reveal(section: HTMLDetailsElement) {
    const selected = section.querySelector<HTMLDetailsElement>('.group-card.selected') || section;
    const sidebar = selected.closest('aside');
    if (!sidebar) return;
    for (const details of sidebar.querySelectorAll<HTMLDetailsElement>('details')) {
      details.open = details === selected || details.contains(selected);
    }
    selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
