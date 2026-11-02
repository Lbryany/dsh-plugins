# B native-policy comparison — fixed regression suite passed

The complete independent batch contains 60 runs: 0.1.1 baseline and 0.1.2 changed, five runs each for E01–E06. Changed passed 30/30, all naturally finished, with zero protection rejections, budget exhaustion or sends after the final substantive result. Quiet cases passed 15/15 (required ≥14); normal collaboration passed 15/15 (required 15).

| Case | Baseline | Changed |
|---|---:|---:|
| E01 completed result | 5/5 | 5/5 |
| E02 acknowledgement | 5/5 | 5/5 |
| E03 factual answer | 5/5 | 5/5 |
| E04 clarification | 0/5 | 5/5 |
| E05 two review rounds | 0/5 | 5/5 |
| E06 parallel values | 0/5 | 5/5 |

The frozen settings remain deepseek-flash, temperature 0, thinking disabled, ≤12,000 input (including cached input) plus output tokens, ≤24 send attempts and ≤180 seconds per run. Provider input counting reserves 32 tokens; each request allows at most 1,000 output tokens. Truncation and inability to fit the next request are failures. Changed used at most 11,146 tokens and four send attempts per run. Total changed usage was 155,363 tokens; baseline was 173,017, with 15 token-cap failures. These totals compare different completion outcomes and do not establish general cost savings.

The final behavior combines tracked request/question/answer/result ownership, actual successful handoff, consumption before releasing a request, concise role-specific receipts and the product's native SystemPrompt policy. The policy preserves user scope against peer-request expansion and requests incremental communication while preserving required detail. It uses the installed Host's public TEAM_POLICY section API; the evaluator renders only sections actually registered by index.apply. A separate packed real-Host test proves the identical policy reaches model input. No evaluation-only instructions, new thresholds or pooled successful samples were added.

[summary.json](summary.json) and the 60 case JSON files retain individual results and transcripts; [analysis.json](analysis.json) gives aggregate counts. [manifest.json](manifest.json) fixes settings, cases and product/harness hashes; harness/ contains the corresponding evaluator sources. product-source.tar.gz retains the exact evaluated product snapshot. [component-validation.json](component-validation.json) records the subsequent client-only malformed-history fallback: Host, tools, messages, policy, harness and cases are unchanged; lib/client.js differs and was checked separately by final 67/67 unit tests and the packed browser-history suite. The original manifest has not been rewritten to claim a whole-package match.

Earlier B batches remain separate failures: [initial lifecycle](../batch-2zMCau/report.md), [role/wait correction](../batch-bZU7dc/report.md), [flat request form](../batch-mGmdBW/report.md), [compact context](../batch-wLlLMb/report.md), and [incremental hints](../batch-0J80dh/report.md). This fixed regression set has guided multiple implementation iterations; passing it is not evidence of unseen-task generalization or elimination of every possible conversation loop.

The evaluator is a core FIFO simulation using actual registered tools and delivered envelopes, not a full Host model-scheduler benchmark. Actual Host handoff, concurrent results and intervening user input are tested separately with a scripted provider. A complete persona override can suppress native prompt sections; guards remain active. Windows and a separate Desktop loading path were not tested; the client declares Web support.

Execution used the user-authorized private copy of the projects-thread profile and existing DeepSeek credential. The original profile was not modified; the private copy was removed on exit. No commit, publication or user-environment installation was performed.
