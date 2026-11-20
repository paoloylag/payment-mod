import { buildGuideDocument } from "./guide-builder.js";
export function printSystemGuide() {
  const guide = document.querySelector('.system-guide-page');
  if (!guide) return;
  document.querySelector('[data-guide-print-frame]')?.remove();
  const frame = document.createElement('iframe');
  frame.dataset.guidePrintFrame = 'true';
  frame.title = 'System Guide print document';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0';
  frame.addEventListener('load', async () => {
    const target = frame.contentWindow;
    await target.document.fonts.ready;
    target.addEventListener('afterprint', () => { frame.remove(); window.focus(); }, { once: true });
    target.focus();
    target.print();
  }, { once: true });
  frame.srcdoc = buildGuideDocument(guide.dataset.guideAudience || "all");
  document.body.append(frame);
}
