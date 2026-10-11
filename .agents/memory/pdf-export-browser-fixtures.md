---
name: PDF export browser fixtures
description: Safely capture generated PDF blobs in browser tests without intercepting worker bundles or other temporary object URLs.
---

When a browser test overrides `URL.createObjectURL` to inspect a generated PDF, keep the native implementation for every non-PDF blob and wait specifically for a blob with `application/pdf` type.

**Why:** Browser apps can create object URLs for worker scripts and other runtime resources after a test installs its hook. Capturing the first blob can mistake a worker bundle for the export or break the worker.

**How to apply:** Save the native method, delegate non-PDF inputs to it, and only replace/capture the PDF URL while exercising the export action.
