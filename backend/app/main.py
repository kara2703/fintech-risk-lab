from math import sqrt
from random import gauss
from statistics import NormalDist, mean, pstdev

import httpx
import yfinance as yf
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


class MarketMetricsResponse(BaseModel):
    ticker: str
    source: str
    period: str
    observations: int
    latest_price: float
    mean_daily_return: float
    daily_volatility: float
    annualized_return: float
    annualized_volatility: float


class PredictRequest(BaseModel):
    portfolio_value: float = Field(gt=0)
    daily_volatility: float = Field(gt=0)
    expected_daily_return: float = Field(default=0.0005, ge=-0.2, le=0.2)
    horizon_days: int = Field(gt=1, le=365)
    simulations: int = Field(default=1000, ge=250, le=20000)


class PredictResponse(BaseModel):
    expected_end_value: float
    expected_pnl: float
    median_end_value: float
    p05_end_value: float
    p95_end_value: float
    probability_profit: float
    probability_drawdown_10pct: float
    simulations: int
    horizon_days: int


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

TRADING_DAYS_PER_YEAR = 252
SUPPORTED_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}


def _period_to_trading_days(period: str) -> int:
    mapping = {"1mo": 21, "3mo": 63, "6mo": 126, "1y": 252, "2y": 504, "5y": 1260}
    return mapping.get(period, 252)


def _compute_metrics_from_prices(ticker: str, source: str, period: str, prices: list[float]) -> MarketMetricsResponse:
    if len(prices) < 2:
        raise HTTPException(status_code=422, detail="Not enough price history to compute metrics.")

    daily_returns = []
    for prev, curr in zip(prices[:-1], prices[1:]):
        if prev <= 0:
            continue
        daily_returns.append((curr / prev) - 1)

    if len(daily_returns) < 2:
        raise HTTPException(status_code=422, detail="Not enough valid return observations to compute metrics.")

    mean_daily_return = mean(daily_returns)
    daily_volatility = pstdev(daily_returns)
    annualized_return = ((1 + mean_daily_return) ** TRADING_DAYS_PER_YEAR) - 1
    annualized_volatility = daily_volatility * sqrt(TRADING_DAYS_PER_YEAR)

    return MarketMetricsResponse(
        ticker=ticker.upper(),
        source=source,
        period=period,
        observations=len(daily_returns),
        latest_price=round(prices[-1], 2),
        mean_daily_return=round(mean_daily_return, 6),
        daily_volatility=round(daily_volatility, 6),
        annualized_return=round(annualized_return, 6),
        annualized_volatility=round(annualized_volatility, 6),
    )


def _fetch_yahoo_prices(ticker: str, period: str) -> list[float]:
    history = yf.Ticker(ticker).history(period=period, auto_adjust=True)
    if history.empty or "Close" not in history:
        raise HTTPException(status_code=404, detail=f"No Yahoo Finance data found for {ticker}.")
    closes = history["Close"].dropna().tolist()
    return [float(price) for price in closes]


def _fetch_alpha_vantage_prices(ticker: str, period: str, alpha_vantage_api_key: str) -> list[float]:
    if not alpha_vantage_api_key:
        raise HTTPException(
            status_code=400,
            detail="alpha_vantage_api_key is required when provider is alpha_vantage.",
        )

    response = httpx.get(
        "https://www.alphavantage.co/query",
        params={
            "function": "TIME_SERIES_DAILY_ADJUSTED",
            "symbol": ticker.upper(),
            "outputsize": "full",
            "apikey": alpha_vantage_api_key,
        },
        timeout=20.0,
    )
    response.raise_for_status()
    payload = response.json()

    if "Error Message" in payload:
        raise HTTPException(status_code=404, detail=f"Alpha Vantage symbol not found: {ticker}.")

    if "Information" in payload:
        raise HTTPException(status_code=429, detail=payload["Information"])

    series = payload.get("Time Series (Daily)")
    if not series:
        raise HTTPException(status_code=502, detail="Unexpected Alpha Vantage response format.")

    ordered_dates = sorted(series.keys())
    closes = [float(series[date]["4. close"]) for date in ordered_dates if "4. close" in series[date]]
    take = _period_to_trading_days(period)
    return closes[-take:]


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/market/asset-metrics", response_model=MarketMetricsResponse)
def get_asset_metrics(
    ticker: str,
    period: str = "1y",
    provider: str = "auto",
    alpha_vantage_api_key: str = "",
) -> MarketMetricsResponse:
    normalized_period = period.lower()
    if normalized_period not in SUPPORTED_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported period. Use one of: {', '.join(sorted(SUPPORTED_PERIODS))}.",
        )

    normalized_provider = provider.lower()
    if normalized_provider not in {"auto", "yahoo", "alpha_vantage"}:
        raise HTTPException(status_code=422, detail="provider must be one of: auto, yahoo, alpha_vantage.")

    if normalized_provider == "yahoo":
        prices = _fetch_yahoo_prices(ticker, normalized_period)
        return _compute_metrics_from_prices(ticker, "yahoo", normalized_period, prices)

    if normalized_provider == "alpha_vantage":
        prices = _fetch_alpha_vantage_prices(ticker, normalized_period, alpha_vantage_api_key)
        return _compute_metrics_from_prices(ticker, "alpha_vantage", normalized_period, prices)

    # auto mode: prefer Yahoo, then fallback to Alpha Vantage if key is provided.
    try:
        prices = _fetch_yahoo_prices(ticker, normalized_period)
        return _compute_metrics_from_prices(ticker, "yahoo", normalized_period, prices)
    except HTTPException as yahoo_error:
        if alpha_vantage_api_key:
            prices = _fetch_alpha_vantage_prices(ticker, normalized_period, alpha_vantage_api_key)
            return _compute_metrics_from_prices(ticker, "alpha_vantage", normalized_period, prices)
        raise yahoo_error


@app.post("/risk/predict", response_model=PredictResponse)
def predict_portfolio_distribution(payload: PredictRequest) -> PredictResponse:
    horizon_mu = payload.expected_daily_return * payload.horizon_days
    horizon_sigma = payload.daily_volatility * sqrt(payload.horizon_days)

    end_values: list[float] = []
    for _ in range(payload.simulations):
        sampled_return = gauss(horizon_mu, horizon_sigma)
        end_values.append(payload.portfolio_value * (1 + sampled_return))

    end_values.sort()
    simulations = len(end_values)

    expected_end_value = mean(end_values)
    expected_pnl = expected_end_value - payload.portfolio_value
    median_end_value = end_values[simulations // 2]
    p05_end_value = end_values[max(0, int(simulations * 0.05) - 1)]
    p95_end_value = end_values[min(simulations - 1, int(simulations * 0.95) - 1)]

    profit_count = sum(1 for value in end_values if value > payload.portfolio_value)
    drawdown_count = sum(1 for value in end_values if value <= payload.portfolio_value * 0.9)

    return PredictResponse(
        expected_end_value=round(expected_end_value, 2),
        expected_pnl=round(expected_pnl, 2),
        median_end_value=round(median_end_value, 2),
        p05_end_value=round(p05_end_value, 2),
        p95_end_value=round(p95_end_value, 2),
        probability_profit=round((profit_count / simulations) * 100, 2),
        probability_drawdown_10pct=round((drawdown_count / simulations) * 100, 2),
        simulations=simulations,
        horizon_days=payload.horizon_days,
    )


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
