# Phase 05 Finance confirmation worksheet

Prepared: 2026-09-29  
Status: PHP conversion basis confirmed by owner on 2026-10-08. Rates remain blank until configured per currency.

The owner also confirmed the first Department Head rejection choices on 2026-10-08: Return to Requestor for editing and resubmission, or Fully Decline to end the request. Both require a reviewer reason. Later-stage rejection destinations remain open.

## 1. Foreign-currency threshold basis

| Finance decision | Confirmed answer | Owner / evidence |
|---|---|---|
| Should USD, EUR, and other-currency requests be converted to PHP before comparing with PHP approval thresholds? | Yes. Set PHP per one unit of each currency; all approval thresholds remain in PHP. | Owner direction, 2026-10-08 |
| If yes, what exchange-rate source and effective date must be used? | Manually configured currency rate is read at submission. An external source or scheduled rate update was not specified. | Owner direction, 2026-10-08 |
| Who approves the rate and any override? | Current `master_data.manage` permission controls rate changes; Finance Manager and System Administrator have this permission in the seeded roles. Additional sign-off rules are not yet defined. | Implementation, 2026-10-08 |
| What rounding rule applies, and must the rate and PHP equivalent be frozen at submission? | Thresholds use the exact Decimal product without rounding; rate and PHP equivalent are frozen in the submitted route snapshot. | Implementation, 2026-10-08 |
| If no conversion is used, what are the currency-specific thresholds and approvers? | Not applicable. | Owner direction, 2026-10-08 |

## 2. Confirmed unbudgeted PHP amount above 1,000,000

| Finance decision | Confirmed answer | Owner / evidence |
|---|---|---|
| Which executive role, if any, must approve before Board Member review? | COO, then President | Owner direction, 2026-09-29 |
| Is the sequence Finance Manager → executive → Board Member, or another order? | Finance Manager review → COO approval → President approval → Board review | Owner direction applied to the prototype sequence, 2026-09-29 |
| Is Board Member the final approval stage? | Board review is last in the confirmed sequence; decision authority still needs definition. | Owner direction, 2026-09-29 |
| What happens if the executive returns or declines the request? |  |  |

## Provisional tiers available for testing

| Request | PHP amount | Last approval stage in the trial |
|---|---:|---|
| Cash Advance | Up to 40,000 | Finance Manager |
| Budgeted, other types | Up to 100,000 | Finance Manager |
| Budgeted, other types | 100,000.01 through 300,000 | COO |
| Budgeted, other types | Above 300,000 | President |
| Unbudgeted, other types | Up to 1,000,000 | COO |
| Unbudgeted, other types | Above 1,000,000 | COO → President → Board Member |

The Phase 05 workflow persists the route and advances one approval stage at a time. A foreign-currency request with no configured PHP rate remains policy pending and has no reviewer assignment. Changing a configured rate affects new submissions only.
