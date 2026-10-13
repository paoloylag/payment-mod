import { closeIcon } from "./icons.js";
// Keep storage private: the API authorizes access and streams the saved object version.
export function openStoredDocumentPreview({ url, downloadUrl, filename, trigger, review }) {
  document.querySelector(".stored-document-preview")?.close();
  const dialog = document.createElement("dialog");
  dialog.className = "stored-document-preview";
  dialog.setAttribute("aria-label", "Document preview");
  dialog.innerHTML = `<header><h3></h3><button type="button" data-preview-close aria-label="Close document preview" class="close-icon-button">${closeIcon}</button></header><div class="stored-document-toolbar" hidden><a class="secondary-button" target="_blank" rel="noopener">Download</a></div><div class="stored-document-content" aria-live="polite"></div>`;
  dialog.querySelector("h3").textContent = filename || "Document preview";
  dialog.querySelector("a").href = downloadUrl;
  const toolbar = dialog.querySelector(".stored-document-toolbar");
  const content = dialog.querySelector(".stored-document-content");
  if (review) {
    const controls = document.createElement("section");
    controls.className = "preview-review-controls";
    controls.innerHTML = `<label>File decision<select aria-label="File decision"><option value="">Select decision</option><option value="accepted">Accepted</option><option value="replacement_required">Replace file</option><option value="rejected">Rejected</option></select></label><label data-preview-review-reason hidden>Reason<textarea rows="2" placeholder="Explain what needs correction"></textarea></label><button type="button">Save decision</button><small role="status"></small>`;
    const select = controls.querySelector("select");
    const reason = controls.querySelector("textarea");
    const save = controls.querySelector("button");
    const status = controls.querySelector("small");
    select.value = review.decision === "pending" ? "" : review.decision;
    const update = () => {
      const needsReason = Boolean(select.value && select.value !== "accepted");
      reason.parentElement.hidden = !needsReason;
      reason.required = needsReason;
      save.disabled = !select.value;
      reason.setCustomValidity("");
    };
    select.addEventListener("change", update);
    update();
    save.addEventListener("click", async () => {
      if (!reason.reportValidity()) return;
      select.disabled = reason.disabled = save.disabled = true;
      status.textContent = "Saving decision…";
      try {
        await review.save(select.value, select.value === "accepted" ? "" : reason.value.trim());
        status.textContent = "Decision saved.";
      } catch (error) { status.textContent = error.message || "The decision could not be saved."; }
      finally { select.disabled = reason.disabled = false; update(); }
    });
    content.before(controls);
  }
  const controller = new AbortController();
  let objectUrl;
  const close = () => dialog.close();
  const showMessage = text => {
    const message = document.createElement("p");
    message.textContent = text;
    content.replaceChildren(message);
  };
  const load = async () => {
    showMessage("Loading document…");
    content.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        const messages = { 401: "Your session has expired. Sign in again to view this document.", 403: "You do not have access to this document.", 404: "This document could not be found.", 410: "This document has been removed." };
        throw new Error(messages[response.status] || "The document could not be loaded. Please try again.");
      }
      const type = response.headers.get("content-type")?.split(";")[0].trim();
      if (type === "application/pdf") toolbar.remove();
      else { content.before(toolbar); toolbar.hidden = false; }
      if (!["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"].includes(type)) {
        await response.body?.cancel();
        showMessage("Preview is unavailable for this file type. Download the file to open it.");
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      const preview = document.createElement(type === "application/pdf" ? "iframe" : "img");
      if (type === "application/pdf") preview.title = filename || "PDF document";
      else preview.alt = filename || "Document image";
      preview.src = objectUrl;
      preview.addEventListener("error", () => { content.before(toolbar); toolbar.hidden = false; showMessage("Your browser could not display this file. Download it to open it."); });
      content.replaceChildren(preview);
    } catch (error) {
      if (controller.signal.aborted) return;
      showMessage(error.message || "The document could not be loaded.");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Try again";
      retry.addEventListener("click", load);
      content.append(retry);
    } finally {
      content.setAttribute("aria-busy", "false");
    }
  };
  dialog.querySelector("[data-preview-close]").addEventListener("click", close);
  dialog.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  dialog.addEventListener("close", () => {
    controller.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    window.removeEventListener("hashchange", close);
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
  }, { once: true });
  window.addEventListener("hashchange", close);
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("[data-preview-close]").focus();
  load();
}
