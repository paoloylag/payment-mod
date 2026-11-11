import { mkdir, writeFile } from "node:fs/promises";
import { buildGuideDocument } from "../src/guide-builder.js";
import { guideAudienceLabels } from "../src/guide-data.js";
await mkdir(new URL("../outputs/", import.meta.url), { recursive: true });
for (const audience of ["all", ...Object.keys(guideAudienceLabels)]) {
  await writeFile(new URL(`../outputs/LIFE-College-Payment-Module-${audience}-Guide.html`, import.meta.url), buildGuideDocument(audience));
}
console.log("Built the all-role guide and role-specific offline HTML guides in outputs/.");
