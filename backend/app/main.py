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
    expected_daily_return: float = Field(default=0.0005, ge=-0.2, le=0.2)
    risk_free_rate_annual: float = Field(default=0.04, ge=0, le=1)


class ScenarioResult(BaseModel):
    name: str
    shock_return_pct: float
    pnl_amount: float
    portfolio_value: float


class RiskResponse(BaseModel):
    var_amount: float
    var_pct: float
    expected_shortfall: float
    expected_shortfall_pct: float
    projected_mean_pnl: float
    projected_mean_value: float
    annualized_volatility: float
    sharpe_ratio_estimate: float
    probability_of_loss: float
    risk_band: str
    confidence_level: float
    horizon_days: int
    scenarios: list[ScenarioResult]


app = FastAPI(title="Fintech Risk Lab API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
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

    normal = NormalDist()
    z = NormalDist().inv_cdf(payload.confidence_level)
    horizon_sigma = payload.daily_volatility * sqrt(payload.horizon_days)
    horizon_mu = payload.expected_daily_return * payload.horizon_days

    # Treat loss as L = -R where R is normally distributed portfolio return.
    var_pct = (-horizon_mu) + (z * horizon_sigma)
    var_amount = payload.portfolio_value * var_pct

    phi = normal.pdf(z)
    tail_alpha = 1 - payload.confidence_level
    expected_shortfall_pct = (-horizon_mu) + (horizon_sigma * (phi / tail_alpha))
    expected_shortfall = payload.portfolio_value * expected_shortfall_pct

    annualized_volatility = payload.daily_volatility * sqrt(252)
    annualized_return = payload.expected_daily_return * 252
    sharpe_ratio_estimate = 0.0
    if annualized_volatility > 0:
        sharpe_ratio_estimate = (annualized_return - payload.risk_free_rate_annual) / annualized_volatility

    probability_of_loss = normal.cdf((-horizon_mu) / horizon_sigma)
    projected_mean_pnl = payload.portfolio_value * horizon_mu
    projected_mean_value = payload.portfolio_value + projected_mean_pnl

    if var_pct < 0.01:
        risk_band = "low"
    elif var_pct < 0.025:
        risk_band = "moderate"
    elif var_pct < 0.05:
        risk_band = "elevated"
    else:
        risk_band = "high"

    scenarios: list[ScenarioResult] = []
    for name, sigma_shock in (
        ("Moderate selloff", -1.5),
        ("Severe selloff", -2.5),
        ("Crash-like move", -4.0),
    ):
        shock_return = horizon_mu + (sigma_shock * horizon_sigma)
        pnl_amount = payload.portfolio_value * shock_return
        scenarios.append(
            ScenarioResult(
                name=name,
                shock_return_pct=round(shock_return * 100, 2),
                pnl_amount=round(pnl_amount, 2),
                portfolio_value=round(payload.portfolio_value + pnl_amount, 2),
            )
        )

    return RiskResponse(
        var_amount=round(var_amount, 2),
        var_pct=round(var_pct * 100, 2),
        expected_shortfall=round(expected_shortfall, 2),
        expected_shortfall_pct=round(expected_shortfall_pct * 100, 2),
        projected_mean_pnl=round(projected_mean_pnl, 2),
        projected_mean_value=round(projected_mean_value, 2),
        annualized_volatility=round(annualized_volatility * 100, 2),
        sharpe_ratio_estimate=round(sharpe_ratio_estimate, 3),
        probability_of_loss=round(probability_of_loss * 100, 2),
        risk_band=risk_band,
        confidence_level=payload.confidence_level,
        horizon_days=payload.horizon_days,
        scenarios=scenarios,
    )
