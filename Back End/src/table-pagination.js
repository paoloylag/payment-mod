const pages = new Map();

export function paginateTables(root, scope) {
  root.querySelectorAll('table').forEach((table, index) => {
    if (!table.tHead || table.closest('.document-paper, .voucher-card, [data-no-pagination]')) return;
    const rows = [...table.tBodies].flatMap(body => [...body.rows]).filter(row => !row.querySelector('.empty-state') && !row.querySelector('td[colspan]'));
    const key = `${scope}:${index}`;
    const signature = rows.map(row => row.textContent.trim()).join('\n');
    const previous = pages.get(key);
    const model = { size: previous?.size || 10, page: previous?.signature === signature ? previous.page : 1, signature };
    pages.set(key, model);
    const controls = document.createElement('nav');
    controls.className = 'table-pagination';
    controls.setAttribute('aria-label', `${table.tHead.textContent.trim().slice(0, 60)} table pagination`);
    controls.innerHTML = '<label>Rows per page<select aria-label="Rows per page"><option>10</option><option>25</option><option>50</option></select></label><span class="table-pagination-range" aria-live="polite"></span><div><button type="button" data-page-previous>Previous</button><span class="table-pagination-page"></span><button type="button" data-page-next>Next</button></div>';
    const wrapper = table.closest('.table-wrap') || table;
    wrapper.after(controls);
    const select = controls.querySelector('select');
    const previousButton = controls.querySelector('[data-page-previous]');
    const nextButton = controls.querySelector('[data-page-next]');
    const update = () => {
      const count = Math.max(1, Math.ceil(rows.length / model.size));
      model.page = Math.min(count, Math.max(1, model.page));
      const start = (model.page - 1) * model.size;
      rows.forEach((row, i) => row.classList.toggle('pagination-hidden', i < start || i >= start + model.size));
      select.value = String(model.size);
      controls.querySelector('.table-pagination-range').textContent = rows.length ? `${start + 1}–${Math.min(start + model.size, rows.length)} of ${rows.length}` : '0 results';
      controls.querySelector('.table-pagination-page').textContent = `Page ${model.page} of ${count}`;
      previousButton.disabled = model.page === 1;
      nextButton.disabled = model.page === count;
    };
    select.addEventListener('change', () => { model.size = Number(select.value); model.page = 1; update(); });
    previousButton.addEventListener('click', () => { model.page--; update(); });
    nextButton.addEventListener('click', () => { model.page++; update(); });
    update();
  });
}
