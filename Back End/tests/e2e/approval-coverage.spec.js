import {test,expect} from "@playwright/test";
import {execFileSync} from "node:child_process";
test("Finance Manager records executive and Board coverage through the UI",async({page})=>{
 test.setTimeout(90000);
 const fixture=`from uuid import uuid4
from decimal import Decimal
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import User,Department,PaymentRequest,PaymentRequestLine,WorkflowInstance
from payment_module.workflow_service import start_workflow
with SessionLocal.begin() as db:
 owner=db.scalar(select(User).where(User.email=='requestor@payment.local'))
 department=db.scalar(select(Department).where(Department.code=='MKTG'))
 item=PaymentRequest(id=uuid4(),request_number='GEN-2026-880003',request_type='general',status='submitted',requestor_id=owner.id,department_id=department.id,payee_name='Coverage test',purpose='Approval coverage browser test',currency_code='PHP',gross_amount=Decimal('1000001'),type_data={'budgeted':False},version=2)
 db.add(item);db.flush()
 db.add(PaymentRequestLine(request_id=item.id,position=1,particulars='Coverage test',amount=Decimal('1000001'),currency_code='PHP'))
 start_workflow(db,item,owner.id)
 workflow=db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id==item.id))
 workflow.current_stage=3`;
 execFileSync("docker",["exec","payment-module-e2e-api","python","-c",fixture]);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/#/login");await page.locator("[data-demo-login]").selectOption("finance.manager@payment.local");await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL("**/#/dashboard");await page.goto("/#/requests/GEN-2026-880003");
 const panel=page.locator(".approval-override-panel");await expect(panel).toContainText("COO");
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();await expect(panel.getByRole("button",{name:"Approve on Behalf",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
 await panel.getByRole("button",{name:"Approve on Behalf",exact:true}).click();let dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"Approve on Behalf",exact:true})).toBeDisabled();await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(panel).toContainText("COO");
 for(const role of ["COO","President","Board"]){
  await expect(panel).toContainText(role);await panel.getByRole("button",{name:"Approve on Behalf",exact:true}).click();dialog=page.getByRole("dialog");await dialog.locator("textarea").fill(`${role} unavailable during leave; Finance Manager provides coverage.`);await dialog.getByRole("button",{name:"Approve on Behalf",exact:true}).focus();await page.keyboard.press("Enter");await expect(dialog).toHaveCount(0);await expect(page.getByText(new RegExp(`^Approved on behalf of ${role === "Board" ? "Board Member" : role}$`,"i"))).toBeAttached();
 }
 await expect(panel).toHaveCount(0);await page.reload();await expect(page.getByText(/^Approved on behalf of Board Member$/i)).toBeAttached();expect(errors).toEqual([]);
});
