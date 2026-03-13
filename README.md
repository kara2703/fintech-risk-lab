# Fintech Risk Lab

Starter project to showcase fintech and trading-risk interest with:

- `frontend`: React + Vite dashboard (JavaScript, npm)
- `backend`: Python FastAPI risk engine (Value-at-Risk + Expected Shortfall)

## Prerequisites

- Node.js `v20+` (set with `nvm`)
- Python `3.10+`

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://127.0.0.1:5173`.

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Runs at `http://127.0.0.1:8000`.

## Sample API call

```bash
curl -X POST http://127.0.0.1:8000/risk/var \
  -H "Content-Type: application/json" \
  -d '{
    "portfolio_value": 250000,
    "daily_volatility": 0.018,
    "confidence_level": 0.95,
    "horizon_days": 1
  }'
```

## Next ideas

- Add position-level PnL and Greeks view
- Plug in market data stream (Polygon/Alpaca/Yahoo)
- Add backtesting and stress-test scenarios
