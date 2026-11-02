# B initial comparison — not passed

60 runs, baseline 0.1.1 versus first 0.1.2 implementation. Same E01–E06, five runs per arm, deepseek-flash, temperature 0, thinking disabled; 12,000 total tokens, 24 sends and 180 seconds per run. Actual registered tools and schemas are supplied to both arms. This differs from A's earlier send-only harness; do not pool those batches.

| Cases | Baseline | Changed |
|---|---|---|
| Quiet E01–E03 | 15/15 | 15/15 |
| E04 clarification | 0/5 | 5/5 |
| E05 two-round review | 0/5 | 0/5 |
| E06 parallel values | 1/5 | 0/5 |

Changed normal cases 5/15 fail the fixed 15/15 line. Nine changed runs stop at token budget and one at truncated output; four tool rejections also occur. E05-0 omits a second-round target; E05-1/2 attempt a reply to a completed request. E05-3 generates but truncates its second-round result, leaving only three delivered edges. Do not claim that result was delivered. Detailed per-run classifications remain in raw JSON.

E06 results are queued but peer_wait returns wait:false, leaving the model in the same turn to call wait again. A dedicated real Host reproduction confirms four calls instead of three. The general result envelope also instructs a closed-request recipient to reply, contradicting its lifecycle. These are corrected in PB08 before a separate full rerun, without changing the scoring line. Red evidence is retained under test/evidence.

The original product source, all raw runs, manifest and analysis remain here. This failed batch is never pooled with the follow-up. The isolated credential/profile copy was removed at exit.
