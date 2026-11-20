# Phase 05 Finance confirmation worksheet

Prepared: 2026-09-29  
Status: Approval tiers and exchange-rate governance confirmed. Recommended workflow exception scope authorized on 2026-10-13; SLA/escalation deferred.

The owner approved temporary delegation to a reviewer with the same authority, reason-required reassignment, controlled material correction through Return/resubmission, and recovery of an unavailable assignment without skipping stages. The implemented authority, scope, expiry, and correction behavior are recorded in `phase-05-plan.md`. Delegation applies to the selected current assignment. System Administrators manage all stages; Finance Managers manage Finance stages and Finance Associate responses. The owner explicitly deferred SLA, reminders, and escalation.

The owner confirmed on 2026-10-08 that Department Head may Return to Requestor for editing and resubmission, or Fully Decline to end the request. On 2026-10-09 the owner extended both actions through the Finance Manager approval stage. Both require a reviewer reason. COO, President, and Board use Request More Information: the question goes to Finance Associate, and after Finance Associate responds the request resumes at the same executive or Board stage without restarting approvals.

On 2026-10-11, the owner confirmed stage-dependent Return destinations. Department Head and Finance Associate may return to Requestor; a request returned by Finance Associate resumes at Finance Associate after requestor correction, preserving Department Head approval. Finance Manager may return to Requestor or Finance Associate. A return to Finance Associate pauses Finance Manager review; after Finance Associate responds, it resumes at Finance Manager with earlier approvals intact. Fully Decline has no destination.

## 1. Foreign-currency threshold basis

| Finance decision | Confirmed answer | Owner / evidence |
|---|---|---|
| Should USD, EUR, and other-currency requests be converted to PHP before comparing with PHP approval thresholds? | Yes. Set PHP per one unit of each currency; all approval thresholds remain in PHP. | Owner direction, 2026-10-08 |
| If yes, what exchange-rate source and effective date must be used? | Finance Manager confirms a rate on each request at review time. The current system rate is a suggested default; a confirmed request rate overrides it. An external source or scheduled rate update was not specified. | Owner direction, 2026-10-10 |
| Who approves the rate and any override? | Finance Manager confirms the request rate while approving the budget/route stage. The actor, rate, PHP equivalent, current system rate, and event time are recorded. Additional sign-off rules are not yet defined. | Owner direction and implementation, 2026-10-10 |
| What rounding rule applies, and must the rate and PHP equivalent be frozen at submission? | Thresholds use the exact Decimal product without rounding. The request rate and PHP equivalent are frozen when Finance Manager approves, before executive routing. | Implementation, 2026-10-10 |
| If no conversion is used, what are the currency-specific thresholds and approvers? | Not applicable. | Owner direction, 2026-10-08 |

## 2. Confirmed unbudgeted PHP amount above 1,000,000

| Finance decision | Confirmed answer | Owner / evidence |
|---|---|---|
| Which executive role, if any, must approve before Board Member review? | COO, then President | Owner direction, 2026-09-29 |
| Is the sequence Finance Manager → executive → Board Member, or another order? | Finance Manager review → COO approval → President approval → Board review | Owner direction applied to the prototype sequence, 2026-09-29 |
| Is Board Member the final approval stage? | Yes. Board approval is the final request-approval decision for this route. Finance may then prepare the voucher; Authorized Signatory payment authorization remains a separate Phase 07 decision. | Owner confirmation, 2026-10-10 |
| What happens when COO, President, or Board needs clarification? | Request More Information sends the question to Finance Associate. The current stage pauses; Finance Associate responds, then that same stage resumes. Earlier approvals remain complete. | Owner direction, 2026-10-09 |

## Confirmed approval amount tiers — 2026-10-10

| Request | PHP amount | Approval after Department Head and Finance Associate |
|---|---:|---|
| Cash Advance | Up to 40,000 | Finance Manager |
| Budgeted, other types | Up to 100,000 | Finance Manager |
| Budgeted, other types | Above 100,000 through 300,000 | Finance Manager → COO |
| Budgeted, other types | Above 300,000 | Finance Manager → President |
| Unbudgeted, other types | Up to 1,000,000 | Finance Manager → COO |
| Unbudgeted, other types | Above 1,000,000 | Finance Manager → COO → President → Board Member |

The amounts are compared as exact PHP Decimal values: the lower tier includes its upper boundary, and the next tier begins strictly above it. The same tiers apply to the PHP equivalent of a foreign-currency request after Finance Manager confirms that request's rate. Cash Advances above PHP 40,000 cannot be approved under this matrix.

The Phase 05 workflow persists each decision and advances one stage at a time. Foreign-currency requests reach Finance Manager even without a system rate. Their executive route remains undecided until Finance Manager confirms a positive request-specific rate. A later system rate change does not alter the confirmed request route.
