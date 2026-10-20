import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

test('Excel and print reconcile every filtered visible request beyond the dashboard page', async ({browser})=>{
  const fixture=`from datetime import UTC,datetime
from decimal import Decimal
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import User,Department,PaymentRequest
with SessionLocal.begin() as db:
 owner=db.scalar(select(User).where(User.email=='requestor@payment.local'))
 department=db.scalar(select(Department).where(Department.code=='MKTG'))
 for i in range(125):
  db.add(PaymentRequest(request_number='GEN-2026-'+str(880000+i),request_type='general',status='submitted',requestor_id=owner.id,department_id=department.id,payee_name='=HYPERLINK("unsafe")' if i==0 else 'Report Vendor',purpose='Phase08Report',currency_code='PHP' if i%2==0 else 'USD',gross_amount=Decimal('100.1250'),submitted_at=datetime(2026,10,20,tzinfo=UTC)))`;
  execFileSync('docker',['exec','payment-module-e2e-api','python','-c',fixture]);
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addInitScript(()=>{window.print=()=>{document.documentElement.dataset.printInvoked='true';};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/#/login');await page.locator('[data-demo-login]').selectOption('finance.associate@payment.local');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/#\/dashboard$/);
    await page.locator('[data-dashboard-filter="voucher"]').fill('Phase08Report');
    await page.locator('[data-toggle-request-filters]').click();
    await expect(page.locator('[data-export-report]')).toBeVisible();
    const downloadEvent=page.waitForEvent('download');await page.locator('[data-export-report]').click();
    const download=await downloadEvent;const book=XLSX.read(readFileSync(await download.path()), {type:'buffer'});
    expect(book.SheetNames).toEqual(['Summary','Transactions']);
    const rows=XLSX.utils.sheet_to_json(book.Sheets.Transactions,{header:1});expect(rows).toHaveLength(126);
    expect(rows.some(row=>row[4] === "'=HYPERLINK(\"unsafe\")")).toBeTruthy();
    expect(Object.values(book.Sheets.Transactions).some(cell=>cell&&typeof cell==='object'&&'f' in cell)).toBeFalsy();
    const summary=XLSX.utils.sheet_to_json(book.Sheets.Summary,{header:1});
    expect(summary.find(row=>row[0]==='Transactions')[1]).toBe(125);
    expect(summary.find(row=>row[0]==='PHP')[1]).toBe(6307.875);
    expect(summary.find(row=>row[0]==='USD')[1]).toBe(6207.75);
    const popupEvent=page.waitForEvent('popup');await page.locator('[data-print-report]').click();
    const popup=await popupEvent;await expect(popup.locator('tbody tr')).toHaveCount(125);
    await expect(popup.locator('body')).toContainText('PHP 6307.8750');await expect(popup.locator('body')).toContainText('USD 6207.7500');
    await popup.close();
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
      await expect(page.locator('[data-export-report]')).toBeEnabled();
    }
    await page.screenshot({path:'outputs/phase08-report-controls.png',fullPage:true});
    await page.route('**/api/v1/reports/requests?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Report temporarily unavailable'})}),{times:1});
    await page.locator('[data-export-report]').click();await expect(page.locator('body')).toContainText('Report temporarily unavailable');
    await expect(page.locator('[data-export-report]')).toBeEnabled();
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
