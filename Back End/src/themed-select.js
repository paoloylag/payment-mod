// Adapt the tenant boilerplate custom-select pattern while preserving native form events.
let sequence = 0;
export function enhanceRequestSelects(root = document) {
  root.querySelectorAll('.request-form-panel select:not([multiple]):not([data-themed-select])').forEach(select => {
    select.dataset.themedSelect = 'true';
    const label = select.getAttribute('aria-label') || [...(select.closest('label')?.childNodes || [])].filter(node => node !== select).map(node => node.textContent).join(' ').trim() || 'Select option';
    const wrapper = document.createElement('div'); wrapper.className = 'custom-select';
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    const value = document.createElement('span'), arrow = document.createElement('span');
    arrow.className = 'custom-select-chevron'; arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true'); trigger.append(value, arrow);
    const menu = document.createElement('div'); menu.id = `request-select-${++sequence}`; menu.className = 'custom-select-menu';
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', label); menu.hidden = true; trigger.setAttribute('aria-controls', menu.id);
    select.before(wrapper); wrapper.append(select, trigger, menu); select.hidden = true;
    const close = () => { menu.hidden = true; wrapper.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); };
    const sync = () => { value.textContent = select.selectedOptions[0]?.textContent || 'Select option'; trigger.disabled = select.disabled; trigger.setAttribute('aria-label', `${label}: ${value.textContent}`); };
    const open = () => {
      if (select.disabled) return;
      document.querySelectorAll('.custom-select.open .custom-select-trigger').forEach(other => { if (other !== trigger) other.click(); });
      menu.replaceChildren();
      [...select.options].forEach(option => {
        if (option.hidden) return;
        const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option'); button.tabIndex = -1;
        const text = document.createElement('span'); text.textContent = option.textContent; button.append(text);
        if (option.selected) { const check = document.createElement('span'); check.textContent = '✓'; check.setAttribute('aria-hidden', 'true'); button.append(check); }
        button.disabled = option.disabled || option.parentElement.disabled === true;
        button.classList.toggle('selected', option.selected); button.setAttribute('aria-selected', String(option.selected));
        button.addEventListener('click', event => {
          event.preventDefault(); const changed = select.value !== option.value; select.value = option.value; sync(); close(); trigger.focus();
          if (!changed) return;
          select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
        }); menu.append(button);
      });
      menu.hidden = false; wrapper.classList.add('open'); trigger.setAttribute('aria-expanded', 'true');
      (menu.querySelector('.selected:not(:disabled)') || menu.querySelector('button:not(:disabled)'))?.focus();
    };
    trigger.addEventListener('click', event => { event.preventDefault(); menu.hidden ? open() : close(); });
    let prefix = '', lastKey = 0;
    wrapper.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); trigger.focus(); return; }
      if (event.key === 'Tab') { close(); return; }
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); if (menu.hidden) { open(); return; }
        const index = items.indexOf(document.activeElement);
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
      } else if (!menu.hidden && event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); prefix = Date.now() - lastKey > 700 ? event.key : prefix + event.key; lastKey = Date.now();
        items.find(item => item.querySelector('span').textContent.toLowerCase().startsWith(prefix.toLowerCase()))?.focus();
      }
    });
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
    const outside = event => { if (!wrapper.isConnected) { document.removeEventListener('pointerdown', outside); return; } if (!wrapper.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside); select.addEventListener('change', sync); sync();
  });
}
