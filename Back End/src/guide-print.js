export function printSystemGuide() {
  const guide = document.querySelector('.system-guide-page');
  if (!guide) return;
  const copy = guide.cloneNode(true);
  copy.querySelectorAll('.guide-print-button, .guide-search, .guide-anchor-nav, .guide-empty, .guide-card-toggle').forEach(node => node.remove());
  copy.querySelectorAll('[hidden]').forEach(node => node.removeAttribute('hidden'));
  copy.querySelectorAll('details').forEach(node => node.open = true);
  document.querySelector('[data-guide-print-frame]')?.remove();
  const frame = document.createElement('iframe');
  frame.dataset.guidePrintFrame = 'true';
  frame.title = 'System Guide print document';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0';
  const printDocument = document.implementation.createHTMLDocument('Payment Module System Guide');
  const style = printDocument.createElement('style');
  style.textContent = `
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #202124; background: white; font: 11pt/1.5 Arial, sans-serif; }
    h2 { font-size: 22pt; margin: 6pt 0; } h3 { font-size: 16pt; margin: 16pt 0 6pt; }
    h4 { font-size: 12pt; margin: 0 0 4pt; } p { margin: 4pt 0 10pt; }
    .eyebrow, .guide-path, small { color: #555; font-size: 9pt; }
    .guide-hero { border-bottom: 2px solid #9e1d20; padding-bottom: 12pt; }
    .guide-section { break-before: page; }
    .guide-card, .guide-stage-list article { margin: 12pt 0; border: 1px solid #ddd; border-radius: 6pt; padding: 12pt; break-inside: avoid; }
    summary { display: block; list-style: none; } summary::-webkit-details-marker { display: none; }
    ol { margin: 8pt 0 0; padding-left: 20pt; } li { margin-bottom: 6pt; }
    .guide-note { border-left: 3px solid #9e1d20; padding-left: 10pt; }
    a { color: inherit; }`;
  printDocument.head.append(style);
  printDocument.body.append(copy);
  frame.addEventListener('load', async () => {
    const target = frame.contentWindow;
    await target.document.fonts.ready;
    target.addEventListener('afterprint', () => { frame.remove(); window.focus(); }, { once: true });
    target.focus();
    target.print();
  }, { once: true });
  frame.srcdoc = '<!doctype html>' + printDocument.documentElement.outerHTML;
  document.body.append(frame);
}
