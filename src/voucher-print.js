// Print a voucher in an isolated Letter-size document so other application
// print rules (including the system guide's A4 layout) cannot override it.
export function printVoucher(sourceVoucher) {
  if (!sourceVoucher) return;

  const frame = document.createElement("iframe");
  frame.dataset.voucherPrintFrame = "true";
  frame.title = "Payment voucher print document";
  frame.hidden = true;
  document.querySelector("iframe[data-voucher-print-frame]")?.remove();

  const printDocument = document.implementation.createHTMLDocument("Payment Voucher");
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    printDocument.head.append(node.cloneNode(true));
  });

  const printCard = document.createElement("div");
  printCard.className = "voucher-card voucher-print-card";
  const collapsibleContent = sourceVoucher.querySelector(":scope > .voucher-collapsible-content");
  if (collapsibleContent) {
    printCard.append(...Array.from(collapsibleContent.childNodes, (node) => node.cloneNode(true)));
  } else {
    printCard.append(...Array.from(sourceVoucher.childNodes, (node) => node.cloneNode(true)));
  }
  printCard.querySelectorAll(".print-button").forEach((node) => node.remove());
  printDocument.body.append(printCard);

  const pageStyle = printDocument.createElement("style");
  pageStyle.textContent = `
    @page { size: Letter portrait; margin: 0.5in; }
    html, body { width: 100%; min-width: 0; margin: 0; padding: 0; background: #fff; }
    .voucher-print-card {
      position: static !important;
      width: 100% !important;
      min-height: calc(10in - 2px) !important;
      height: calc(10in - 2px) !important;
      box-sizing: border-box !important;
      margin: 0 !important;
    }
  `;
  printDocument.head.append(pageStyle);

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
