# Admin audit history query plans

The audit-history query was measured on a disposable PostgreSQL 16.10 cluster
with 100,000 rows and then 1,000,000 rows. Rows were inserted in timestamp
order, with actions alternating across 100-row blocks (50% `suspend`,
50% `reactivate`) and outcomes distributed as 1% `pending`, 9% `failed`, and
90% `succeeded`. The combined `suspend` + `pending` filter matched half the
pending rows. Plans used `EXPLAIN (ANALYZE, BUFFERS)`; each baseline was
vacuumed before measuring so PostgreSQL could use index-only scans when
available.

## Findings

- The existing `(created_at, id)` index preserves newest-first order. For a
  shallow single-action page at 1M rows it returned 50 rows in about 0.06 ms,
  reading 5 shared buffers; no action-leading page index was justified.
- With the original expanded `created_at < cursor OR (created_at = cursor AND
  id < cursor_id)` predicate, a deep combined-filter page scanned hundreds of
  thousands of entries from the newest end of the index (232,351 rows removed
  by the filter; 5,113 buffers and about 38.9 ms). Replacing that equivalent
  lexicographic condition with `(created_at, id) < (cursor_time, cursor_id)`
  made it an index range condition. With the existing ordering index, a
  1M-row deep page then read 115 buffers for 50 pending rows (about 1.0 ms),
  or 224 buffers for the combined action/outcome filter (about 1.3 ms).
- At 100k rows, both representative filtered counts used sequential scans
  (1,214 buffers; about 8.6 ms for `outcome='pending'` and 12.1 ms for
  `action='suspend' AND outcome='pending'`). At 1M rows, they used parallel
  sequential scans (12,133 buffers; about 47.1 ms and 54.5 ms, respectively).
- A single `(outcome, created_at, id, action)` index preserves the page order
  for outcome and combined filters, supports the tuple cursor range, and
  covers both filter columns for counts. With it, the exact API projection
  read 53 buffers for 50 pending rows (about 0.16 ms) or 55 for the combined
  filter (about 0.44 ms). Counts used index-only scans with no heap fetches
  (80-81 buffers; about 2.4 ms for either filter).
- The measured candidate occupied 68 MiB versus 39 MiB for the existing
  ordering index. This is a material storage/write-cost increase, but at 1M
  rows the outcome-filtered count fell from 12,133 to 80 buffers and from
  47 ms to 2.4 ms. No separate action-only index was added: action pages
  already use the ordering index efficiently, while action-only counts remain
  broad enough for PostgreSQL to prefer a sequential scan.

These are local plan measurements, not production latency guarantees. The
synthetic data distribution and cache state can differ from a deployed audit
table; revisit the index if real outcome distributions or write volume change
substantially.
