import test from "node:test";
import assert from "node:assert/strict";
import { generalRequestVendor } from "../src/request-vendor.js";
test("General request lines use the selected validated APS supplier", () => {
 const vendors=[{id:"a",name:"Supplier A",status:"active",source:"aps"},{id:"p",name:"PO Supplier",status:"active",source:"procurement"}];
 assert.deepEqual(generalRequestVendor({general_vendor_mode:"existing",vendor_external_id:"a"},vendors),{name:"Supplier A",pending:false});
 assert.equal(generalRequestVendor({general_vendor_mode:"existing",vendor_external_id:"p"},vendors).name,"");
 assert.equal(generalRequestVendor({general_vendor_mode:"existing"},vendors).name,"");
});
test("New supplier name stays request-bound and follows edits without using the old selection", () => {
 assert.deepEqual(generalRequestVendor({general_vendor_mode:"new",general_vendor_name:" New Supplier ",vendor_external_id:"old"}),{name:"New Supplier",pending:true});
 assert.equal(generalRequestVendor({general_vendor_mode:"new",general_vendor_name:"Renamed"}).name,"Renamed");
});
