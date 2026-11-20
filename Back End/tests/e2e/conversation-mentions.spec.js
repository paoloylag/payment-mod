import {execFileSync} from "node:child_process";
import {expect,test} from "@playwright/test";

test("tag recipients see persistent message highlights and a notification that opens the message",async({browser})=>{
 test.setTimeout(120000);
 const fixture=`from uuid import uuid4
from datetime import UTC,datetime
from decimal import Decimal
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import User,Department,PaymentRequest,PaymentRequestLine
from payment_module.workflow_service import start_workflow
with SessionLocal.begin() as db:
 owner=db.scalar(select(User).where(User.email=='requestor@payment.local'))
 department=db.scalar(select(Department).where(Department.code=='MKTG'))
 item=PaymentRequest(id=uuid4(),request_number='GEN-2026-880002',request_type='general',status='submitted',requestor_id=owner.id,department_id=department.id,payee_name='Mention test',purpose='Conversation recipient highlight',currency_code='PHP',gross_amount=Decimal('18000'),type_data={'budgeted':True},version=2,submitted_at=datetime.now(UTC))
 db.add(item);db.flush()
 db.add(PaymentRequestLine(request_id=item.id,position=1,particulars='Mention test',amount=Decimal('18000'),currency_code='PHP'))
 start_workflow(db,item,owner.id)
 print(item.id)`;
 const id=execFileSync("docker",["exec","payment-module-e2e-api","python","-c",fixture],{encoding:"utf8"}).trim();
 const contexts=[],errors=[];
 const signIn=async email=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/#/login");await page.locator("[data-demo-login]").selectOption(email);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto("/#/requests/GEN-2026-880002");const expand=page.getByRole("button",{name:"Open request conversation",exact:true});if(await expand.isVisible())await expand.click();return page;
 };
 try{
  const recipient=await signIn("department.head@payment.local"),sender=await signIn("requestor@payment.local");
  const session=await recipient.evaluate(async()=>(await(await fetch("/api/v1/auth/session")).json()));
  const name=session.user.display_name;
  const input=sender.locator("[data-conversation-form] textarea");await input.fill("@");
  await sender.getByRole("option").filter({hasText:name}).click();
  await input.fill(`@${name} Please review the receipt.`);
  const posted=sender.waitForResponse(response=>response.url().endsWith(`/requests/${id}/conversation`)&&response.request().method()==="POST");
  await sender.getByRole("button",{name:"Post Message",exact:true}).click();const response=await posted;expect(response.ok(),await response.text()).toBeTruthy();const message=await response.json();
  execFileSync("docker", ["exec", "payment-module-e2e-api", "python", "-m", "payment_module.notification_worker", "--development-mailbox"]);
  const emails = await recipient.evaluate(async () => (await (await fetch("/api/v1/notifications/email-previews")).json()));
  const email = emails.items.find(item => item.action_url?.includes(message.id));
  expect(email.subject).toContain("tagged you in GEN-2026-880002");
  expect(email.text_body).toContain("Please review the receipt.");
  expect(email.html_body).toContain("View Conversation");
  await expect(sender.locator(`#message-${message.id}`)).toBeVisible();await expect(sender.locator(".conversation-entry.is-mentioned")).toHaveCount(0);
  await recipient.locator("[data-toggle-notifications]").click();
  const notice=recipient.locator(".notification-row").filter({hasText:"Please review the receipt."});await expect(notice).toContainText("Tagged You");await expect(notice.locator("[data-open-notification]")).toHaveClass(/unread/);
  const markedRead=recipient.waitForResponse(response=>response.url().includes("/api/v1/notifications/")&&response.url().endsWith("/read")&&response.request().method()==="POST");
  await notice.locator("[data-open-notification]").click();expect((await markedRead).ok()).toBeTruthy();
  const target=recipient.locator(`#message-${message.id}`);await expect(target).toHaveClass(/is-mentioned/);await expect(target.getByText("Mentioned You",{exact:true})).toBeVisible();
  const notifications=await recipient.evaluate(async()=>(await(await fetch("/api/v1/notifications")).json()));
  expect(notifications.items.find(item=>item.message_id===message.id).read_at).not.toBeNull();
  await input.fill("Ordinary note without a tag.");await sender.getByRole("button",{name:"Post Message",exact:true}).click();await expect(sender.locator(".conversation-entry")).toHaveCount(2);
  await recipient.reload();const expand=recipient.getByRole("button",{name:"Open request conversation",exact:true});if(await expand.isVisible())await expand.click();
  await expect(recipient.locator(".conversation-entry")).toHaveCount(2);await expect(target).toHaveClass(/is-mentioned/);
  await expect(recipient.locator(".conversation-entry").filter({hasText:"Ordinary note without a tag."})).not.toHaveClass(/is-mentioned/);
  const emailContext = await browser.newContext({viewport:{width:375,height:900}});contexts.push(emailContext);
  const emailPage = await emailContext.newPage();
  await emailPage.goto(`/${new URL(email.action_url).hash}`);
  await emailPage.locator("[data-demo-login]").selectOption("department.head@payment.local");
  await emailPage.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(emailPage).toHaveURL(/GEN-2026-880002\/conversation\//);
  await expect(emailPage.locator(`#message-${message.id}`)).toBeVisible();
  await expect(emailPage.locator(`#message-${message.id}`)).toHaveClass(/is-mentioned/);

  for(const width of [375,768,1440]){
   await recipient.setViewportSize({width,height:900});
   await expect(async()=>{const open=recipient.getByRole("button",{name:"Open request conversation",exact:true});if(await open.isVisible())await open.click();await expect(target).toBeVisible({timeout:1000});}).toPass({timeout:10000});
   await target.scrollIntoViewIfNeeded();
   expect(await recipient.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
   await recipient.screenshot({path:`outputs/mention-recipient-${width}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
 }finally{for(const context of contexts)await context.close();}
});
