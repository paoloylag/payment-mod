# Phase 05 Finance confirmation worksheet

Prepared: 2026-09-29  
Status: Foreign-currency routing remains blank. The PHP Board sequence was confirmed on 2026-09-29.

## 1. Foreign-currency threshold basis

| Finance decision | Confirmed answer | Owner / evidence |
|---|---|---|
| Should USD, EUR, and other-currency requests be converted to PHP before comparing with PHP approval thresholds? |  |  |
| If yes, what exchange-rate source and effective date must be used? |  |  |
| Who approves the rate and any override? |  |  |
| What rounding rule applies, and must the rate and PHP equivalent be frozen at submission? |  |  |
| If no conversion is used, what are the currency-specific thresholds and approvers? |  |  |

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

The trial is read-only. It does not create assignments or advance financial records. Foreign-currency requests return an explicit pending-policy error from the preview API. Generic Phase 05 persistence, assignment, event, authorization, concurrency, and queue work can be prepared while Finance confirms the currency rule.
