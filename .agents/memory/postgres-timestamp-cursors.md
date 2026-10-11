---
name: PostgreSQL timestamp cursors
description: Preserve PostgreSQL microsecond precision in cursor-based pagination.
---

Keyset cursors over PostgreSQL `timestamptz` must retain the exact database timestamp precision. The default PostgreSQL timestamp precision is microseconds, while JavaScript `Date` preserves only milliseconds; serializing a `Date` as the cursor boundary can skip or repeat rows written within the same millisecond.

**Why:** A cursor boundary rounded to milliseconds failed to include a valid older row during ordered pagination.

**How to apply:** When paging by a PostgreSQL timestamp, keep an exact-precision UTC timestamp string for comparison and the cursor token, and use a stable unique tie-breaker such as the row ID. Continue converting timestamps to normal ISO values only for display/API event fields.
