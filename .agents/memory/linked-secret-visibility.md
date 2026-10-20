---
name: Linked secret visibility
description: Account-linked secrets can reach the app even when secret-list metadata reports them missing.
---

Do not treat a missing entry in secret-status metadata as proof that an account-linked secret is unavailable to the running application.

**Why:** An account-linked Poe secret was available in the app's runtime while the Agent's secret-status checks reported it absent in both environments. Asking the user to add it again was unnecessary.

**How to apply:** When the user identifies a linked secret, check runtime presence only, without reading or displaying its value. Keep the link intact; do not duplicate or overwrite it with a project secret. In tests of a sanitized child environment, assert against the child launched through the supported runner; do not infer child availability from the parent process's secret presence, and compare parent presence metadata before/after if checking for leakage.
