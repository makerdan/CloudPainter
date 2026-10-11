---
name: Disposable Postgres on Nix
description: Starting a temporary local PostgreSQL cluster in Nix/Replit hosts with no system PostgreSQL runtime directory.
---

For disposable local PostgreSQL validation on Nix hosts, set the server's Unix-socket directory to the temporary cluster directory (for example, `pg_ctl ... -o "-k $tempdir ..."`) rather than relying on `/run/postgresql`.

**Why:** the Nix-packaged PostgreSQL server may default its socket and lock files to `/run/postgresql`, which is not guaranteed to exist in the Replit runtime; the server can bind TCP and then immediately shut down because it cannot create that lock file.

**How to apply:** initialize a new temporary data directory, bind TCP only to loopback on a known free port, direct Unix sockets to the temporary directory, poll `pg_isready`, use only a temporary test database, then stop and remove the cluster. Never substitute a shared or production database.
