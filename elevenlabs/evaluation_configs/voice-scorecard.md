# Voice selection scorecard

Shortlist exactly three production-licensed voices. Record the ElevenLabs voice ID only in environment configuration until the release owner approves it.

| Criterion | Weight | Pass threshold |
|---|---:|---:|
| Nigerian personal and place-name pronunciation | 25% | 4/5 |
| Spelled email and number intelligibility over GSM noise | 20% | 4/5 |
| Calm professional authority | 15% | 4/5 |
| Natural turn endings and interruption recovery | 15% | 4/5 |
| Latency with Eleven Flash v2.5 | 15% | p95 first audio within target |
| Listener preference across Nigerian SMB test panel | 10% | 70% positive |

Reject any voice that fails a threshold, regardless of its weighted total. Test speed at 0.95, 1.0, and 1.05; start production at 1.0. Record license terms, test date, model, environment, evaluator, and artifact checksums.
