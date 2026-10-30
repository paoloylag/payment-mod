import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { prepareRecoveries } from "./recovery-fixtures.js";

test("Finance reconciliation follows verified returns, recoveries, exports and request links", async ({browser})=>{
  test.setTimeout(180000);
  const fixture=await prepareRecoveries();
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(), errors=[];page.on("pageerror",error=>errors.push(error.message));
  const manager=fixture.roles["finance.manager"], associate=fixture.roles["finance.associate"];
  const panel=page.locator(".financial-report-panel");
  const generate=async(kind,search)=>{
    await panel.locator('[name="kind"]').selectOption(kind);
    await panel.locator('[name="search"]').fill(search);
    await panel.getByRole("button",{name:"Generate report",exact:true}).click();
    await expect(panel.locator('table').first().locator('tbody tr')).toHaveCount(1);
  };
  try{
    await page.goto("/#/login");await page.locator("[data-demo-login]").selectOption("finance.manager@payment.local");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto("/#/tracker");await expect(panel).toBeVisible();
    await generate("payments",fixture.general.request_number);
    await expect(panel.locator(".financial-report-totals")).toContainText("1,100.00");
    await panel.locator('[name="state"]').selectOption("unclaimed");
    await panel.getByRole("button",{name:"Generate report",exact:true}).click();
    await expect(panel).toContainText("No matching records. Adjust the filters and generate the report again.");
    await panel.locator('[name="state"]').selectOption("");
    await panel.getByRole("button",{name:"Generate report",exact:true}).click();
    await expect(panel.locator('table').first().locator('tbody tr')).toHaveCount(1);
    const downloadEvent=page.waitForEvent("download");await panel.locator("[data-finance-report-export]").click();
    const book=XLSX.read(readFileSync(await (await downloadEvent).path()),{type:"buffer"});
    expect(book.SheetNames).toEqual(["Summary","Reconciliation","Payment lines"]);
    const rows=XLSX.utils.sheet_to_json(book.Sheets.Reconciliation);expect(rows).toHaveLength(1);
    expect(rows[0]["Net due"]).toBe(1100);expect(rows[0]["Net released"]).toBe(1100);
    const popupEvent=page.waitForEvent("popup");await panel.locator("[data-finance-report-print]").click();
    const popup=await popupEvent;await expect(popup.locator("tbody tr")).toHaveCount(1);await expect(popup.locator("body")).toContainText("1100.00");await popup.close();
    await panel.locator("[data-finance-report-request]").click();await expect(page).toHaveURL(new RegExp(fixture.general.request_number));
    await page.goto("/#/tracker");
    await generate("advances",fixture.advance.request_number);
    await expect(panel.locator("tbody")).toContainText("400.00");await expect(panel.locator("tbody")).toContainText("Outstanding");
    await fixture.upload(associate,`payments/${fixture.liquidation.id}/fund-return`,{request_version:String(fixture.liquidation.version),version:"0",amount:"400",recorded_on:"2026-10-15",reference:"FINANCE-ACCEPTANCE-RETURN",receiving_office:"Finance cash office",receiving_account_id:fixture.receivingAccount,reason:"Full unused balance received"});
    await generate("advances",fixture.advance.request_number);await expect(panel.locator("tbody")).toContainText("Outstanding");
    await fixture.post(manager,`payments/${fixture.liquidation.id}/fund-return/verify`,{request_version:fixture.liquidation.version,version:1,reason:"Finance independently verified receipt"});
    await generate("advances",fixture.advance.request_number);await expect(panel.locator("tbody")).toContainText("Settled");
    await generate("returns",fixture.liquidation.request_number);await expect(panel.locator("tbody")).toContainText("Verified");
    const proof=await fixture.upload(associate,`payments/${fixture.general.id}/lines/${fixture.payment}/evidence/upload`,{kind:"recovery"});
    await fixture.post(associate,`payments/${fixture.general.id}/lines/${fixture.payment}/recover`,{request_version:fixture.general.version,version:3,reason:"Funds fully recovered",evidence_id:proof.id,recovered_amount:"1100",bank_name:"Cash office",recipient_name:"Payee",recorded_on:"2026-10-15"});
    await generate("recoveries",fixture.general.request_number);await expect(panel.locator("tbody")).toContainText("Pending");
    await fixture.post(manager,`payments/${fixture.general.id}/lines/${fixture.payment}/confirm-reversal`,{request_version:fixture.general.version,version:4,reason:"Full recovery independently verified"});
    await generate("recoveries",fixture.general.request_number);await expect(panel.locator("tbody")).toContainText("Verified");
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
      for(const select of await panel.locator("select:visible").all())expect(await select.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(42);
      await page.screenshot({path:`outputs/finance-report-${width}.png`,fullPage:true});
    }
    await page.route("**/api/v1/reports/finance?*",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"Finance report temporarily unavailable"})}),{times:1});
    await panel.locator("[data-finance-report-export]").click();await expect(page.locator("body")).toContainText("Finance report temporarily unavailable");
    await expect(panel.locator("[data-finance-report-export]")).toBeEnabled();
    expect(errors).toEqual([]);
  }finally{await context.close();await fixture.dispose();}
});
