# Ticket Purchase Limits: Fees vs User Experience

## Stripe Fee Model (US)
- **2.9% + $0.30 per charge**
- The **$0.30 is per transaction**, not per ticket

---

## Why 1 Ticket per Purchase Hurts

### Example
Assume:
- Ticket price: **$10**
- Group size: **5 people**

#### Option A — 1 purchase, 5 tickets ($50)
- Stripe fee:  
  - 2.9% of $50 = $1.45  
  - + $0.30  
  - **Total fee: $1.75**
- Net received: **$48.25**
- Effective fee: **3.5%**

#### Option B — 5 purchases, 1 ticket each ($10 × 5)
- Fee per purchase:  
  - 2.9% of $10 = $0.29  
  - + $0.30 = $0.59
- Total Stripe fees: **$2.95**
- Net received: **$47.05**
- Effective fee: **5.9%**

**Result:**  
Splitting purchases costs **$1.20 more** on the same $50 of revenue.

---

## Scaling Effect
The fixed $0.30 fee compounds with each checkout:

| Tickets | One Purchase Fee | Split Purchases Fee | Extra Cost |
|------:|-----------------:|--------------------:|-----------:|
| 2 | $0.88 | $1.18 | +$0.30 |
| 3 | $1.17 | $1.77 | +$0.60 |
| 5 | $1.75 | $2.95 | +$1.20 |
| 10 | $3.20 | $5.90 | +$2.70 |

---

## User Experience Impact
Limiting to 1 ticket per purchase:
- Forces repeated checkout
- Increases abandonment
- Breaks “one person pays for the group”
- Feels artificial and frustrating

You lose **money and conversions**.

---

## Recommended Path Forward

### Allow multiple tickets per purchase
- Let users buy **1–N tickets in one checkout**
- Better UX
- Lower Stripe fees
- Matches real-world behavior

---

## Bottom Line
- **Financially:** fewer checkouts = lower fees  
- **UX:** fewer checkouts = higher conversion  