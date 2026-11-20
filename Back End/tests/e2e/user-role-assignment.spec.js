import {test,expect} from "@playwright/test";
test("administrator creates and edits user roles",async({page})=>{
 await page.goto("/#/login");await page.locator("[data-demo-login]").selectOption("admin@payment.local");await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL("**/#/dashboard");
 await page.goto("/#/administration/users");await page.getByRole("button",{name:"+ User",exact:true}).click();
 const modal=page.getByRole("dialog");await modal.locator('[name="display_name"]').fill("Role Assignment Test");await modal.locator('[name="email"]').fill("role.assignment.test@payment.local");await modal.locator('[name="password"]').fill("Role-Assignment-Test-2026!");
 const choices=modal.locator('[name="role_ids"]');const first=await choices.nth(0).inputValue(),second=await choices.nth(1).inputValue();await choices.nth(0).check();await choices.nth(1).check();
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await expect(modal.getByRole("group",{name:"Roles",exact:true})).toBeVisible();}
 await modal.getByRole("button",{name:"Create user",exact:true}).click();await expect(modal).toHaveCount(0);
 const row=page.locator(".identity-list article").filter({hasText:"role.assignment.test@payment.local"});await expect(row).toBeVisible();
 const edit=async()=>{await row.locator('[data-identity-action-menu]').click();await row.getByRole("button",{name:"Edit",exact:true}).click();};
 await edit();await expect(modal.locator(`[name="role_ids"][value="${first}"]`)).toBeChecked();await expect(modal.locator(`[name="role_ids"][value="${second}"]`)).toBeChecked();await modal.locator(`[name="role_ids"][value="${first}"]`).uncheck();await modal.getByRole("button",{name:"Save changes",exact:true}).click();await expect(modal).toHaveCount(0);
 await page.reload();await expect(row).toBeVisible();await edit();await expect(modal.locator(`[name="role_ids"][value="${first}"]`)).not.toBeChecked();await expect(modal.locator(`[name="role_ids"][value="${second}"]`)).toBeChecked();await modal.locator(`[name="role_ids"][value="${second}"]`).uncheck();await modal.getByRole("button",{name:"Save changes",exact:true}).click();await expect(row).toContainText("No role");
});
