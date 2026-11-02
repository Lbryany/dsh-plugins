# B single-destination comparison — not passed

Complete independent 60-run comparison, unchanged cases, model, settings, limits and thresholds. See manifest and analysis for exact totals. Baseline 0.1.1 versus revised 0.1.2; prior batches remain separate.

Changed scores: quiet 15/15, E04 5/5, E05 3/5, E06 5/5; overall 28/30, normal 13/15. Zero rejection in all changed runs; the two failures are token-budget stops.

The explicit single-destination interface removes the earlier malformed nested request correction in the observed review traces. Two review rounds can deliver all four edges without rejection, but remaining input plus final report still exceeds the 12,000-token total budget. Task exchange alone is not completion of the user-facing report, so these runs remain failed.

PB10 is frozen before the next batch to reduce duplicate tool-description, receipt, envelope and discovery-list overhead. Original task/result content is not truncated; IDs, legal roles, per-target receipts and unknown/error semantics remain. Full discovery context is available via details:true. This is a product interface/context change, not a larger allowance or grading exception.

Product source, raw runs, manifest, analysis and harness are retained here. The isolated credential/profile copy was removed at exit.
