# Spain Electricity Dashboard

Dark interactive dashboard scaffold for exploring Spain's electricity generation mix, demand, balance, international exchanges, emissions, storage behavior, and marginal-price-setting technology history.

The repo contains:

- `backend/`: FastAPI API over a generated local analytics store.
- `frontend/`: React + Vite dashboard UI with dark control-room styling.
- `scripts/build_sample_store.py`: generates a local sample dataset shaped for REE and OMIE-style ingestion.
- `docs/RUNBOOK.md`: reproducible local run steps.

This implementation ships a working local MVP with synthetic precomputed sample data and a canonical technology mapping. The architecture is ready to replace the sample generator with live REE/OMIE ingestion, but the current dashboard should not be read as historical truth.

## Run

Single-command local launch:

```bash
npm start
```

This starts both the API and the frontend from the repo root. Stop both with `Ctrl+C`.

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
python3 scripts/build_sample_store.py
cd backend
uvicorn app.main:app --reload
```

Equivalent repo-root command:

```bash
npm run api:dev
```

Frontend:

```bash
npm run dev
```

Open `http://localhost:5173`.

This command now works from the repo root. If you prefer, `cd frontend && npm run dev` still works too.

## Current data behavior

- Generation, demand, exchanges, capacity, balance, and emissions are served from a generated local sample store.
- Interconnector imports/exports are synthetic gross-flow examples constrained to the sample net balance; they are not historical bilateral series.
- Coverage stats are calculated from hourly sample data that spans `2019-01-01T00:00:00` through `2026-03-31T23:00:00`.
- Marginal technology is also generated hourly across that same synthetic sample window.
