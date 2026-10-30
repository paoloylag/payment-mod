import {test} from "node:test";
import assert from "node:assert/strict";
import {filterTrackerRequests} from "../src/tracker-table.js";
const rows=[
 {id:"GEN-10",backendId:"10",backendStatus:"submitted",approvalState:"approved",submitted:"2026-10-20",returned:"",resubmitted:"",type:"general",vendor:"Alpha",paymentSummary:{state:"released"}},
 {id:"GEN-2",backendId:"2",backendStatus:"returned",submitted:"2026-10-01",returned:"2026-10-04",resubmitted:"",type:"general",vendor:"Beta"},
 {id:"GEN-3",backendId:"3",backendStatus:"submitted",approvalState:"active",status:"COO Approval",submitted:"2026-10-10",returned:"2026-10-03",resubmitted:"2026-10-05",type:"reimbursement",vendor:"Alpha",paymentSummary:{state:"authorized"}}
];
test("sorts the complete dataset naturally without changing original order",()=>{
 assert.deepEqual(filterTrackerRequests(rows,{sortKey:"id",sortDirection:"asc"}).map(r=>r.id),["GEN-2","GEN-3","GEN-10"]);
 assert.deepEqual(rows.map(r=>r.id),["GEN-10","GEN-2","GEN-3"]);
});
test("missing dates remain last in both directions",()=>{
 assert.deepEqual(filterTrackerRequests(rows,{sortKey:"returned",sortDirection:"asc"}).map(r=>r.id),["GEN-3","GEN-2","GEN-10"]);
 assert.deepEqual(filterTrackerRequests(rows,{sortKey:"returned",sortDirection:"desc"}).map(r=>r.id),["GEN-2","GEN-3","GEN-10"]);
});
test("combines status, payment, type, search and inclusive date filters",()=>{
 assert.deepEqual(filterTrackerRequests(rows,{query:" alpha ",requestStatus:"COO Approval",paymentStatus:"Pending Release",type:"reimbursement",dateField:"resubmitted",dateFrom:"2026-10-05",dateTo:"2026-10-05"}).map(r=>r.id),["GEN-3"]);
 assert.equal(filterTrackerRequests(rows,{requestStatus:"Returned",paymentStatus:"Released"}).length,0);
 assert.equal(filterTrackerRequests(rows,{dateField:"returned",dateFrom:"2026-10-03"}).length,2);
});
