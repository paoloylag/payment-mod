// Print only the current role's guide, independently of application print rules.
export function printSystemGuide() {
  const guide = document.querySelector(".system-guide-page");
  if (!guide) return;
  const copy = guide.cloneNode(true);
  copy.querySelectorAll(".guide-print-button, .guide-search, .guide-anchor-nav, .guide-empty").forEach((node) => node.remove());
  copy.querySelectorAll("[hidden]").forEach((node) => node.removeAttribute("hidden"));

  document.querySelector("iframe[data-guide-print-frame]")?.remove();
  const frame = document.createElement("iframe");
  frame.dataset.guidePrintFrame = "true";
  frame.title = "System Guide print document";
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0";
  const printDocument = document.implementation.createHTMLDocument("Payment Module System Guide");
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    const style = node.cloneNode(true);
    if (style.tagName === "LINK") style.href = node.href;
    printDocument.head.append(style);
  });
  printDocument.body.append(copy);
  frame.addEventListener("load", async () => {
    const printWindow = frame.contentWindow;
    await printWindow.document.fonts.ready;
    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  frame.srcdoc = "<!doctype html>" + printDocument.documentElement.outerHTML;
  document.body.append(frame);
}
