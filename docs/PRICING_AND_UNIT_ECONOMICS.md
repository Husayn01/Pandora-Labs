# Pandora pricing and unit economics

Last reviewed: 13 July 2026. Provider prices change; Finance must review the linked rate cards monthly and before changing included minutes.

## Recommended launch model

Use subscriptions for the software and included web/inbound voice allowance. Use a separate prepaid wallet for outbound PSTN calls to Nigeria. Do not hide variable carrier costs inside an unlimited plan.

| Plan | Monthly price | Best fit | Included |
| --- | ---: | --- | --- |
| Free | ₦0 | Evaluation and microbusinesses | 1 seat, 500 web commands, 15 web voice minutes, tasks/reminders, Calendar read-only |
| Solo | ₦29,900 | Owner-operated business | 2 seats, 5,000 commands, 100 combined web/inbound voice minutes, Google actions, drafts and reports |
| Business | ₦79,900 | Small operating team | 5 seats, 25,000 commands, 400 combined web/inbound voice minutes, approvals, WhatsApp/Telegram when released |
| Scale | ₦199,900 | Multi-location operation | 15 seats, 100,000 commands, 1,200 combined web/inbound voice minutes, SIP onboarding, exports and priority support |

The Free plan is deliberately useful, but PSTN access and external sends remain disabled. Apply email verification, per-IP and per-account rate limits, bot protection, and abuse review before marketing free voice at scale.

## Current cost facts

- ElevenAgents currently lists $0.08 per additional call minute, $0.16 burst minutes, and separate LLM/telephony charges. Its included-minute/concurrency bands are Free 15/4, Starter 75/6, Creator 275/10, Pro 1,238/20, Scale 3,738/30, and Business 12,375/40. Source: https://elevenlabs.io/pricing/agents?price.platform=agents_platform
- Twilio's Nigeria rate card currently lists outbound local calls at $0.2303/min and mobile at $0.2349/min. Browser/app and BYOC/SIP media are $0.0040/min. Twilio does not show a native Nigerian voice number on this rate card; international numbers start at $1.15/month. Source: https://www.twilio.com/en-us/voice/pricing/ng
- Twilio Verify starts at $0.05 per successful verification plus the channel fee. Source: https://www.twilio.com/en-us/verify/pricing
- Paystack local Nigerian transactions are 1.5% + ₦100, with the ₦100 waived below ₦2,500 and total fee capped at ₦2,000. Source: https://paystack.com/pricing

## Margin guardrail

Evaluate gross margin per tenant monthly:

```text
revenue_net = subscription_price - Paystack_fee - refunds - taxes
voice_cogs_ngn = (
  ElevenLabs_minutes * ElevenLabs_USD_rate
  + telephony_minutes_by_route * carrier_USD_rate
  + LLM_cost_USD
) * treasury_FX_rate * FX_buffer
gross_margin = (revenue_net - voice_cogs_ngn - workflow_infra - support_allocation) / revenue_net
```

Required controls:

1. Target at least 65% blended gross margin and alert below 55%.
2. Use the treasury conversion rate plus a 10–15% FX buffer; never hard-code a public exchange rate.
3. Keep outbound Nigeria calling prepaid. At today's listed provider rates, ElevenAgents plus Twilio mobile termination starts around $0.3149/min before LLM, verification, tax, FX and support, so bundling outbound minutes at the current subscription prices is unsafe.
4. Disable ElevenLabs burst pricing in normal operation or include the $0.16/min rate in capacity alerts.
5. Upgrade the shared ElevenLabs workspace before reaching 70% of its included minutes or concurrency. Do not create one ElevenLabs workspace per Pandora tenant.
6. Alert at 50%, 75%, 90% and 100% of every tenant allowance; enforce the hard stop server-side.

## Payments

Paystack hosted checkout is the primary Nigerian subscription method. Cards and Direct Debit support recurring subscriptions. Bank transfer and USSD are appropriate for prepaid wallet top-ups or manual renewal, not as an assumption for unattended recurring debit.

The application must treat the signed webhook as the source of truth. It verifies the HMAC, organization, exact Pandora plan code, Paystack plan code, amount and currency, then applies the subscription change atomically. A browser callback never activates a plan.

## Before public pricing is final

- Confirm Nigerian VAT/tax treatment with an accountant and terms/refund policy with Nigerian counsel.
- Negotiate a local SIP/BYOC carrier for a familiar +234 access number and materially lower termination rates.
- Get written ElevenLabs startup grant/enterprise terms, DPA, concurrency, support and incident commitments.
- Add prepaid wallet funding, reserve/reconcile/refund ledgers and low-balance alerts before outbound calling is enabled.
- Model three demand cases (p50, p90 and peak concurrency) using actual pilot call length and action rates.
