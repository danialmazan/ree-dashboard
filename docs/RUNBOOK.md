# Runbook

## 1. Create backend environment

```bash
cd /Users/danielalmazan/Projects/codex/test_ree/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Generate the local analytics store

```bash
cd /Users/danielalmazan/Projects/codex/test_ree
python3 scripts/build_sample_store.py
```

This writes `backend/data/sample_store.json`.

The generated store contains:

- Monthly sample series from `2019-01-01` through `2026-03-01` for generation, exchanges, balance, capacity, and emissions.
- Hourly sample series from `2019-01-01T00:00:00` through `2026-03-31T23:00:00` for coverage statistics and marginal technology.
- Synthetic interconnector gross flows that are useful for UI development but are not historical bilateral REE values.

## 3. Run the API

```bash
cd /Users/danielalmazan/Projects/codex/test_ree/backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

API base URL: `http://localhost:8000`

Equivalent repo-root command:

```bash
cd /Users/danielalmazan/Projects/codex/test_ree
npm run api:dev
```

## 3b. Run both services together

```bash
cd /Users/danielalmazan/Projects/codex/test_ree
npm start
```

This launches the FastAPI backend and the Vite frontend in one terminal. Stop both with `Ctrl+C`.

## 4. Install frontend dependencies

```bash
cd /Users/danielalmazan/Projects/codex/test_ree/frontend
npm install
```

## 5. Run the dashboard

```bash
cd /Users/danielalmazan/Projects/codex/test_ree
npm run dev
```

Open `http://localhost:5173`.

Equivalent direct frontend command:

```bash
cd /Users/danielalmazan/Projects/codex/test_ree/frontend
npm run dev
```

## 6. Run tests

```bash
cd /Users/danielalmazan/Projects/codex/test_ree/backend
source .venv/bin/activate
pytest
```

## 7. Swap sample data for live ingestion later

- Replace generator functions in `backend/app/sample_store.py` with REE/OMIE fetch + normalize steps.
- Keep the API contracts and technology mapping stable so the frontend can remain unchanged.
- Rebuild the store with `python3 scripts/build_sample_store.py`.
