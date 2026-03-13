from math import sqrt
from statistics import NormalDist

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class RiskRequest(BaseModel):
    portfolio_value: float = Field(gt=0)
    daily_volatility: float = Field(gt=0)
    confidence_level: float = Field(gt=0.5, lt=0.9999)
    horizon_days: int = Field(gt=0, le=365)


class RiskResponse(BaseModel):
    var_amount: float
    expected_shortfall: float
    confidence_level: float
    horizon_days: int


app = FastAPI(title="Fintech Risk Lab API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/risk/var", response_model=RiskResponse)
def compute_var(payload: RiskRequest) -> RiskResponse:
    if payload.confidence_level in (0.0, 1.0):
        raise HTTPException(status_code=400, detail="Confidence must be between 0 and 1.")

    z = NormalDist().inv_cdf(payload.confidence_level)
    horizon_vol = payload.daily_volatility * sqrt(payload.horizon_days)
    var_amount = payload.portfolio_value * z * horizon_vol

    # Normal distribution expected shortfall approximation.
    phi = NormalDist().pdf(z)
    tail_alpha = 1 - payload.confidence_level
    expected_shortfall = payload.portfolio_value * horizon_vol * (phi / tail_alpha)

    return RiskResponse(
        var_amount=round(var_amount, 2),
        expected_shortfall=round(expected_shortfall, 2),
        confidence_level=payload.confidence_level,
        horizon_days=payload.horizon_days,
    )
