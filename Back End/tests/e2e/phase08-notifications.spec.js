import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('workflow inbox delivers to reached reviewers, supports read state and safe links', async ({browser}) => {
  const fixture = `from uuid import uuid4
from datetime import UTC, datetime
from decimal import Decimal
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import User,Department,PaymentRequest,PaymentRequestLine
from payment_module.workflow_service import start_workflow
with SessionLocal.begin() as db:
 owner=db.scalar(select(User).where(User.email=='requestor@payment.local'))
 department=db.scalar(select(Department).where(Department.code=='MKTG'))
 item=PaymentRequest(id=uuid4(),request_number='GEN-2026-880001',request_type='general',status='submitted',requestor_id=owner.id,department_id=department.id,payee_name='Phase 08 notification test',purpose='Browser notification acceptance',currency_code='PHP',gross_amount=Decimal('18000'),type_data={'budgeted':True},version=2,submitted_at=datetime.now(UTC))
 db.add(item);db.flush()
 db.add(PaymentRequestLine(request_id=item.id,position=1,particulars='Notification test',amount=Decimal('18000'),currency_code='PHP'))
 start_workflow(db,item,owner.id)
 print(item.id)`;
  const id=execFileSync('docker',['exec','payment-module-e2e-api','python','-c',fixture],{encoding:'utf8'}).trim();
  const runWorker=()=>execFileSync('docker',['exec','payment-module-e2e-api','python','-m','payment_module.notification_worker','--development-mailbox'],{encoding:'utf8'});
  runWorker();
  const contexts=[],errors=[];
  const signIn=async role=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/#/login');await page.locator('[data-demo-login]').selectOption(`${role}@payment.local`);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/#\/dashboard$/);return page;
  };
  try{
    const head=await signIn('department.head');
    await head.locator('[data-toggle-notifications]').click();
    let row=head.locator('.notification-row').filter({hasText:'GEN-2026-880001'});
    await expect(row).toContainText('Approval action needed');await expect(row.locator('.notification-item')).toHaveClass(/unread/);
    await row.getByRole('button',{name:'Mark read',exact:true}).click();await expect(row.locator('.notification-item')).not.toHaveClass(/unread/);
    await row.getByRole('button',{name:'Mark unread',exact:true}).click();await expect(row.locator('.notification-item')).toHaveClass(/unread/);
    for(const width of [375,768,1440]){
      await head.setViewportSize({width,height:900});
      await expect(head.locator('.notification-panel')).toBeVisible();
      expect(await head.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
      const box=await head.locator('.notification-panel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
      if(width===375)await head.screenshot({path:'outputs/phase08-notifications-mobile.png'});
    }
    await row.locator('[data-open-notification]').click();await expect(head).toHaveURL(/#\/requests\//);
    await head.locator('[data-backend-approve]').click();
    const response=head.waitForResponse(r=>r.url().endsWith(`/workflow/${id}/approve`)&&r.request().method()==='POST');
    await head.locator('[data-confirm-action-prompt]').click();expect((await response).ok()).toBeTruthy();runWorker();
    const finance=await signIn('finance.associate');await finance.locator('[data-toggle-notifications]').click();
    await expect(finance.locator('.notification-row').filter({hasText:'GEN-2026-880001'})).toContainText('Approval action needed');
    const coo=await signIn('coo');await coo.locator('[data-toggle-notifications]').click();
    await expect(coo.locator('.notification-row').filter({hasText:'GEN-2026-880001'})).toHaveCount(0);
    await finance.locator('[data-close-notifications]').click();
    await finance.route('**/api/v1/notifications?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Temporary notification service error'})}),{times:1});
    await finance.locator('[data-toggle-notifications]').click();await expect(finance.getByRole('alert')).toContainText('Temporary notification service error');
    await finance.getByRole('button',{name:'Try again',exact:true}).click();await expect(finance.locator('.notification-row')).toHaveCount(1);
    expect(errors).toEqual([]);
  }finally{for(const context of contexts)await context.close();}
});
