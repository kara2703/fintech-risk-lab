#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f ".venv/bin/activate" ]; then
  source ".venv/bin/activate"
fi

uvicorn app.main:app --reload --reload-dir app --reload-exclude ".venv/*"
