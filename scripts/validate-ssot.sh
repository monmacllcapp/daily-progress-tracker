#!/bin/bash
# SSOT Validation Script

set -e

echo "Validating SSOT reference..."

TAG=$(grep -oP '(?<=\*\*Tag\*\* \| `)[^`]+' SSOT_POINTER.md || echo "")

if [ -z "$TAG" ]; then
  echo "Error: Could not extract SSOT tag from SSOT_POINTER.md"
  exit 1
fi

echo "Found SSOT tag: $TAG"

if ! gh api "repos/monmacllcapp/app-architect-codex-ssot/git/refs/tags/$TAG" > /dev/null 2>&1; then
  echo "Error: Tag $TAG not found in SSOT repository"
  exit 1
fi

echo "SSOT validation passed: $TAG exists"
