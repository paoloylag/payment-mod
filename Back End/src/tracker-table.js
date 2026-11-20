import {trackerRequestStatus, trackerPaymentStatus} from "./tracker-status.js";
export const trackerColumns = [["id","Request"],["submitted","Submitted"],["returned","Returned"],["resubmitted","Resubmitted"],["requestStatus","Request Status"],["paymentStatus","Payment Status"]];
export const defaultTrackerTable = {query:"",requestStatus:"",paymentStatus:"",type:"",dateField:"submitted",dateFrom:"",dateTo:"",sortKey:"submitted",sortDirection:"desc"};
const collator = new Intl.Collator("en",{numeric:true,sensitivity:"base"});
const dateValue = value => /^\d{4}-\d{2}-\d{2}/.test(value || "") ? value.slice(0,10) : "";
const valueFor = (r,key) => key === "requestStatus" ? trackerRequestStatus(r) : key === "paymentStatus" ? trackerPaymentStatus(r) : ["submitted","returned","resubmitted"].includes(key) ? dateValue(r[key]) : r.id;
export function filterTrackerRequests(requests, choices = {}) {
 const f = {...defaultTrackerTable,...choices};
 const query = f.query.trim().toLocaleLowerCase();
 const rows = requests.filter(r=>{
  const date = dateValue(r[f.dateField]);
  return (!query || [r.id,r.requestor,r.department,r.vendor,r.purpose].some(value=>String(value || "").toLocaleLowerCase().includes(query)))
   && (!f.type || r.type === f.type) && (!f.requestStatus || trackerRequestStatus(r) === f.requestStatus)
   && (!f.paymentStatus || trackerPaymentStatus(r) === f.paymentStatus)
   && (!f.dateFrom || date && date >= f.dateFrom) && (!f.dateTo || date && date <= f.dateTo);
 });
 return rows.sort((a,b)=>{
  const av=valueFor(a,f.sortKey),bv=valueFor(b,f.sortKey);
  if(!av || !bv){if(av)return -1;if(bv)return 1;}
  return collator.compare(av || "",bv || "")*(f.sortDirection === "asc" ? 1 : -1) || collator.compare(a.id,b.id);
 });
}
