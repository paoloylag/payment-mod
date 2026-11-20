import { guideSections, guideRevision, guideAudienceLabels } from "./guide-data.js";
import { guideLogo, guideCss } from "./guide-brand.js";
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function buildGuideDocument(audience = "all") {
  if (audience !== "all" && !Object.hasOwn(guideAudienceLabels, audience)) throw new Error("Unknown guide audience");
  const sections = guideSections.map(section => ({ ...section, cards: section.cards.filter(card => audience === "all" || card.audiences.includes(audience)) })).filter(section => section.cards.length);
  const title = `${audience === "all" ? "All roles" : guideAudienceLabels[audience]} guide`;
  const content = sections.map(section => `<section id="${escape(section.id)}"><h2>${escape(section.number)} / ${escape(section.title)}</h2>${section.cards.map(card => `<article class="guide-card"><h3>${escape(card.title)}</h3><p class="path">${escape(card.path)}</p><ol class="steps">${card.steps.map(step => `<li>${escape(step)}</li>`).join("")}</ol></article>`).join("")}<p class="note">${escape(section.note)}</p></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LIFE College — Payment Module ${escape(title)}</title><style>${guideCss}</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div><div class="page"><header><img class="logo" src="${guideLogo}" alt="LIFE College International"><span class="label">${escape(title)}</span></header><div class="hero"><span class="eyebrow">Staff quick reference</span><h1>Payment Module</h1><p>Requests, reviews, vouchers and payment recovery.</p><p class="small">Reviewed ${guideRevision} · Finance must confirm actual operating settings and business acceptance.</p></div><main>${content || '<p>This historical role has no new payment authorization step. Contact the administrator about your current responsibilities.</p>'}</main><footer>LIFE College International · Payment Module · Revision ${guideRevision}<p>Local workflow guide. Live enterprise connections, external email and SLA escalation are outside this guide’s enabled scope. This file contains procedures only, without request or account data.</p></footer></div></body></html>`;
}

export function downloadSystemGuide(audience) {
  const url = URL.createObjectURL(new Blob([buildGuideDocument(audience)], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `LIFE-College-Payment-Module-${audience}-Guide.html`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
