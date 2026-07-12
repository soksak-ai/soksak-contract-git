#!/usr/bin/env bash
# The gate: the acceptance suite for soksak-git-spec, run against the registrar's implementer.
# Idempotent and re-runnable — the fixture is rebuilt and reclaimed on every run.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --test tests/*.test.mjs
