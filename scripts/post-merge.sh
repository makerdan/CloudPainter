#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db push
pnpm --filter @workspace/api-server setup:image-access
