# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2025-09-02

### Added
- PhD Coach v3.27 prompts for LLM diet and workout planning (enabled by default).
- Ingredient preferences UI (multi-select) to avoid items in plans; saved as `avoid_ingredients`.
- Calorie-aware diet planning: computes daily calorie target from Intake (Mifflin–St Jeor + activity + goal rate), distributes kcal to meals.
- Header badge indicating LLM status (Active/Off) based on `/api/v1/status`.
- Dev launcher `scripts/dev.sh` to run API + UI with health wait and env loading.
- Postgres setup script `scripts/setup_postgres.sh` and reset script `scripts/reset_db.py`.

### Changed
- Project is now Postgres-only; SQLite paths removed.
- Groceries sync is idempotent and clears open items by default; no quantity inflation on rebuild.
- About You becomes the post-auth landing tab; minor UI cleanups.
- README updated with Postgres dev flow, LLM usage, and scripts.

### Fixed
- `app/core/llm.py` indentation error causing Uvicorn startup failure.

### Notes
- LLM is enabled by default and falls back to deterministic planners if `OPENAI_API_KEY` is not configured.

[0.4.0]: https://github.com/DragianXOG/diet-app/releases/tag/v0.4.0
