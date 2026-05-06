#!/bin/bash
# Push every variable from .env.local to Vercel for both Production and Preview.
# Skips comments and empty lines. Idempotent — `vercel env add` upserts.
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo ".env.local not found"
  exit 1
fi

while IFS='=' read -r key value || [ -n "$key" ]; do
  # Skip comments + empty lines
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # Trim surrounding whitespace
  key="$(echo "$key" | xargs)"
  # Strip surrounding quotes from value if any
  value="${value%\"}"
  value="${value#\"}"
  echo "Adding $key..."
  # Pipe value into vercel env add for each environment.
  for env in production preview; do
    echo "$value" | vercel env add "$key" "$env" --force >/dev/null 2>&1 || \
      echo "  (skipped $env — already exists or error)"
  done
done < .env.local

echo "Done."
