# B role/wait correction — not passed

Complete independent 60-run comparison, 0.1.1 versus revised 0.1.2, unchanged E01–E06/5 runs/12,000 total tokens/24 sends/180 seconds. See manifest and analysis for exact settings and totals. No pooling with prior batches.

Changed quiet cases: 15/15. Clarification E04: 5/5. Parallel values E06: 5/5. Two-round review E05: 0/5, all token-budget stops. Normal cases therefore 10/15, below the fixed 15/15 line.

Queued-result handoff and role-specific result instructions remove the prior E06 repeated-wait pattern. E05 still produces long review messages, and second-round nested requests frequently omit the required destination. Parameter validation correctly rejects these; correcting the argument adds a model call before the remaining review can finish. Raw failed samples remain unchanged.

Before another full rerun, PB09 adds a mutually exclusive explicit single-destination form to the existing request tool and improves incremental text guidance without hard truncation. It does not infer destinations or accept incomplete calls, and budgets and scoring remain unchanged. Original product source and harness are retained here. The isolated credential/profile copy was removed at exit.
