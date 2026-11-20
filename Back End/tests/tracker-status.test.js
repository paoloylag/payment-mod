import assert from "node:assert/strict";
import { test } from "node:test";
import { trackerRequestStatus, trackerPaymentStatus } from "../src/tracker-status.js";
const request = {backendId:"saved",backendStatus:"submitted",type:"general"};
test("request approval and payment release readiness are independent",()=>{
  const approved={...request,approvalState:"approved",status:"Voucher Issued",currentStep:14};
  assert.equal(trackerRequestStatus(approved),"Approved");
  assert.equal(trackerPaymentStatus(approved),"Unapproved");
  assert.equal(trackerPaymentStatus({...approved,paymentSummary:{state:"payment_prepared"}}),"Pending Release");
  assert.equal(trackerPaymentStatus({...approved,paymentSummary:{state:"authorized"}}),"Pending Release");
});
test("request stages, returns and information requests retain their meaning",()=>{
  assert.equal(trackerRequestStatus({...request,approvalState:"active",status:"COO Approval"}),"COO Approval");
  assert.equal(trackerRequestStatus({...request,backendStatus:"returned",approvalState:"returned"}),"Returned");
  assert.equal(trackerRequestStatus({...request,approvalState:"information_requested"}),"Information Requested");
});
test("release, partial release and recovery states are not conflated",()=>{
  for(const [state,label] of Object.entries({released:"Released",cleared:"Released",partially_released:"Partially Released",ready_for_pickup:"Pending Release",recovery_pending:"Recovery Pending",reversed:"Reversed",voided:"Voided"}))assert.equal(trackerPaymentStatus({...request,paymentSummary:{state}}),label);
});
test("a zero-payable liquidation differs from a returned cash advance",()=>{
  assert.equal(trackerPaymentStatus({...request,type:"liquidation",paymentSummary:{state:"funds_returned"}}),"No Payment Required");
  assert.equal(trackerPaymentStatus({...request,type:"cashAdvance",paymentSummary:{state:"funds_returned"}}),"Released");
  assert.equal(trackerPaymentStatus({...request,backendStatus:"declined"}),"Not Applicable");
});

test("Petty Cash approval does not create payment processing",()=>{
  const petty={...request,type:"pettyCash",approvalState:"approved"};
  assert.equal(trackerRequestStatus(petty),"Approved");
  assert.equal(trackerPaymentStatus(petty),"Not Applicable");
});
