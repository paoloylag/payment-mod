import {test,expect} from "@playwright/test";
import {execFileSync} from "node:child_process";
const fixture=code=>execFileSync("docker",["exec","payment-module-e2e-api","python","-c",code],{encoding:"utf8"}).trim();
test("cost center configuration routes requests to its assigned head across departments",async({browser})=>{
 test.setTimeout(90000);
 const centerId=fixture(`from uuid import uuid4
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import CostCenter,Department,User,Role,UserRole
from payment_module.security import hash_password
with SessionLocal.begin() as db:
 department=db.scalar(select(Department).where(Department.code=='OPS'))
 user=User(id=uuid4(),email='center.reviewer@payment.local',display_name='Cost Center Reviewer',department_id=department.id,password_hash=hash_password('Phase01-Test-Only!'))
 db.add(user);db.flush()
 role=db.scalar(select(Role).where(Role.code=='department_head'))
 db.add(UserRole(user_id=user.id,role_id=role.id))
 print(db.scalar(select(CostCenter.id).where(CostCenter.code=='MKTG')))`);
 const contexts=[];const errors=[];
 const signIn=async email=>{const context=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('/#/login');await page.locator('input[name="email"]').fill(email);await page.locator('input[name="password"]').fill('Phase01-Test-Only!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/#/dashboard');return page;};
 try{
 const manager=await signIn('finance.manager@payment.local');await manager.goto('/#/master-data/cost-centers');
 let form=manager.locator(`[data-cost-center-approver="${centerId}"]`);await expect(form).toBeVisible();
 for(const width of [375,768,1440]){await manager.setViewportSize({width,height:900});await form.scrollIntoViewIfNeeded();expect(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await expect(form.getByRole('button',{name:'Save approver',exact:true})).toBeVisible();await manager.screenshot({path:`outputs/cost-center-approver-${width}.png`,fullPage:true});}
 const original=await form.locator('select').inputValue();await form.locator('select').selectOption({label:'Cost Center Reviewer'});await form.getByRole('button',{name:'Save approver',exact:true}).focus();await manager.keyboard.press('Enter');await expect(manager.getByText('Approver saved',{exact:true})).toBeVisible();await manager.reload();form=manager.locator(`[data-cost-center-approver="${centerId}"]`);await expect(form.locator('select option:checked')).toHaveText('Cost Center Reviewer');
 fixture(`from uuid import uuid4
from decimal import Decimal
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import CostCenter,User,PaymentRequest,PaymentRequestLine
from payment_module.workflow_service import start_workflow
with SessionLocal.begin() as db:
 owner=db.scalar(select(User).where(User.email=='requestor@payment.local'))
 center=db.scalar(select(CostCenter).where(CostCenter.code=='MKTG'))
 item=PaymentRequest(id=uuid4(),request_number='GEN-2026-880004',request_type='general',status='submitted',requestor_id=owner.id,department_id=center.department_id,payee_name='Cost center routing',purpose='Department approver mapping test',currency_code='PHP',gross_amount=Decimal('18000'),type_data={'budgeted':True,'department_cost_center_id':str(center.id)},version=2)
 db.add(item);db.flush();db.add(PaymentRequestLine(request_id=item.id,position=1,particulars='Test',amount=Decimal('18000'),currency_code='PHP',cost_center_id=center.id));start_workflow(db,item,owner.id)`);
 await form.locator('select').selectOption(original);await form.getByRole('button',{name:'Save approver',exact:true}).click();await expect(manager.getByText('Approver saved',{exact:true})).toBeVisible();
 const reviewer=await signIn('center.reviewer@payment.local');await reviewer.goto('/#/requests/GEN-2026-880004');await expect(reviewer.getByRole('button',{name:'Approve',exact:true})).toBeVisible();await expect(reviewer.locator('.workflow-current-assignment')).toContainText('Cost Center Reviewer');await reviewer.getByRole('button',{name:'Approve',exact:true}).click();await reviewer.getByRole('dialog').getByRole('button',{name:'Approve Request',exact:true}).click();await expect(reviewer).toHaveURL(/#\/approvals$/);
 expect(errors).toEqual([]);
 }finally{for(const context of contexts)await context.close();}
});
