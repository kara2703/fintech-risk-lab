import { useMemo, useState } from 'react'
import './App.css'

const formatCurrency = (value) =>
  Number(value).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

const formatPercent = (value) => `${Number(value).toFixed(2)}%`

const toNumber = (raw, fallback = 0) => {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function SliderField({ label, value, setValue, min, max, step, formatValue }) {
  return (
    <label className="slider-field">
      <span>{label}</span>
      <div className="slider-row">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setValue(toNumber(event.target.value, value))}
        />
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setValue(toNumber(event.target.value, value))}
        />
      </div>
      {formatValue && <small>{formatValue(value)}</small>}
    </label>
  )
}

function App() {
  const [ticker, setTicker] = useState('AAPL')
  const [marketPeriod, setMarketPeriod] = useState('1y')
  const [marketProvider, setMarketProvider] = useState('auto')
  const [alphaVantageApiKey, setAlphaVantageApiKey] = useState('')
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketMessage, setMarketMessage] = useState('')

  const [portfolioValue, setPortfolioValue] = useState(250000)
  const [dailyVolatility, setDailyVolatility] = useState(0.018)
  const [expectedDailyReturn, setExpectedDailyReturn] = useState(0.0008)
  const [riskFreeRateAnnual, setRiskFreeRateAnnual] = useState(0.04)
  const [confidence, setConfidence] = useState(0.95)
  const [horizonDays, setHorizonDays] = useState(5)
  const [simulations, setSimulations] = useState(2500)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [error, setError] = useState('')

  const canRun = useMemo(() => {
    return (
      portfolioValue > 0 &&
      dailyVolatility > 0 &&
      confidence > 0.5 &&
      confidence < 1 &&
      horizonDays > 0 &&
      simulations >= 250
    )
  }, [portfolioValue, dailyVolatility, confidence, horizonDays, simulations])

  const runRisk = async () => {
    setError('')
    setLoading(true)
    try {
      const basePayload = {
        portfolio_value: Number(portfolioValue),
        daily_volatility: Number(dailyVolatility),
        expected_daily_return: Number(expectedDailyReturn),
        horizon_days: Number(horizonDays),
      }

      const [riskResponse, predictResponse] = await Promise.all([
        fetch('http://127.0.0.1:8000/risk/var', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...basePayload,
            risk_free_rate_annual: Number(riskFreeRateAnnual),
            confidence_level: Number(confidence),
          }),
        }),
        fetch('http://127.0.0.1:8000/risk/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...basePayload,
            simulations: Number(simulations),
          }),
        }),
      ])

      const riskPayload = await riskResponse.json()
      const predictPayload = await predictResponse.json()

      if (!riskResponse.ok) {
        throw new Error(riskPayload.detail || 'Unable to calculate risk.')
      }
      if (!predictResponse.ok) {
        throw new Error(predictPayload.detail || 'Unable to run predictive analysis.')
      }

      setResult(riskPayload)
      setPrediction(predictPayload)
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  const loadMarketData = async () => {
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol.')
      return
    }

    setError('')
    setMarketMessage('')
    setMarketLoading(true)
    try {
      const params = new URLSearchParams({
        ticker: ticker.trim().toUpperCase(),
        period: marketPeriod,
        provider: marketProvider,
      })
      if (alphaVantageApiKey.trim()) {
        params.set('alpha_vantage_api_key', alphaVantageApiKey.trim())
      }

      const response = await fetch(`http://127.0.0.1:8000/market/asset-metrics?${params.toString()}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.detail || 'Unable to fetch market data.')
      }

      setDailyVolatility(payload.daily_volatility)
      setExpectedDailyReturn(payload.mean_daily_return)
      setMarketMessage(
        `Loaded ${payload.ticker} from ${payload.source}. Latest ${formatCurrency(
          payload.latest_price,
        )}, daily vol ${formatPercent(payload.daily_volatility * 100)}, annual return ${formatPercent(
          payload.annualized_return * 100,
        )}.`,
      )
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setMarketLoading(false)
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Fintech Risk Lab</h1>
        <p>Portfolio risk analytics with VaR, ES, Sharpe, and stress scenarios.</p>
      </header>

      <section className="card">
        <h2>Market Data Autofill</h2>
        <div className="grid">
          <label>
            Ticker
            <input
              type="text"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder="AAPL"
            />
          </label>
          <label>
            Lookback Period
            <select
              value={marketPeriod}
              onChange={(event) => setMarketPeriod(event.target.value)}
            >
              <option value="1mo">1 month</option>
              <option value="3mo">3 months</option>
              <option value="6mo">6 months</option>
              <option value="1y">1 year</option>
              <option value="2y">2 years</option>
              <option value="5y">5 years</option>
            </select>
          </label>
          <label>
            Data Provider
            <select
              value={marketProvider}
              onChange={(event) => setMarketProvider(event.target.value)}
            >
              <option value="auto">Auto (Yahoo then Alpha)</option>
              <option value="yahoo">Yahoo Finance</option>
              <option value="alpha_vantage">Alpha Vantage</option>
            </select>
          </label>
          <label>
            Alpha Vantage API Key (optional)
            <input
              type="password"
              value={alphaVantageApiKey}
              onChange={(event) => setAlphaVantageApiKey(event.target.value)}
              placeholder="Only required for Alpha provider"
            />
          </label>
        </div>
        <button disabled={marketLoading} onClick={loadMarketData}>
          {marketLoading ? 'Fetching Market Data...' : 'Load Market Metrics'}
        </button>
        {marketMessage && <p className="market-message">{marketMessage}</p>}
      </section>

      <section className="card">
        <h2>Inputs</h2>
        <div className="grid">
          <SliderField
            label="Portfolio Value ($)"
            value={portfolioValue}
            setValue={setPortfolioValue}
            min={10000}
            max={2000000}
            step={5000}
            formatValue={formatCurrency}
          />
          <SliderField
            label="Daily Volatility"
            value={dailyVolatility}
            setValue={setDailyVolatility}
            min={0.001}
            max={0.08}
            step={0.001}
            formatValue={(value) => formatPercent(value * 100)}
          />
          <SliderField
            label="Expected Daily Return"
            value={expectedDailyReturn}
            setValue={setExpectedDailyReturn}
            min={-0.01}
            max={0.01}
            step={0.0001}
            formatValue={(value) => formatPercent(value * 100)}
          />
          <SliderField
            label="Risk-Free Rate (annual)"
            value={riskFreeRateAnnual}
            setValue={setRiskFreeRateAnnual}
            min={0}
            max={0.12}
            step={0.001}
            formatValue={(value) => formatPercent(value * 100)}
          />
          <SliderField
            label="Confidence"
            value={confidence}
            setValue={setConfidence}
            min={0.8}
            max={0.999}
            step={0.001}
            formatValue={(value) => formatPercent(value * 100)}
          />
          <SliderField
            label="Horizon (days)"
            value={horizonDays}
            setValue={setHorizonDays}
            min={1}
            max={60}
            step={1}
          />
          <SliderField
            label="Simulation Count"
            value={simulations}
            setValue={setSimulations}
            min={250}
            max={10000}
            step={250}
          />
        </div>

        <button disabled={!canRun || loading} onClick={runRisk}>
          {loading ? 'Running...' : 'Run Risk + Predictive Analysis'}
        </button>

        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="card result">
          <h2>Portfolio Analysis</h2>
          <div className="pill-row">
            <span className={`pill ${result.risk_band}`}>Risk band: {result.risk_band}</span>
          </div>

          <h3>Tail Risk</h3>
          <div className="result-grid">
            <p>
              VaR ({(result.confidence_level * 100).toFixed(0)}%):{' '}
              <strong>{formatCurrency(result.var_amount)}</strong> (
              {formatPercent(result.var_pct)})
            </p>
            <p>
              Expected Shortfall: <strong>{formatCurrency(result.expected_shortfall)}</strong>{' '}
              ({formatPercent(result.expected_shortfall_pct)})
            </p>
            <p>
              Probability of Loss: <strong>{formatPercent(result.probability_of_loss)}</strong>
            </p>
            <p>
              Horizon: <strong>{result.horizon_days} day(s)</strong> at{' '}
              <strong>{(result.confidence_level * 100).toFixed(0)}%</strong> confidence
            </p>
          </div>

          <h3>Return/Risk Quality</h3>
          <div className="result-grid">
            <p>
              Projected Mean PnL: <strong>{formatCurrency(result.projected_mean_pnl)}</strong>
            </p>
            <p>
              Projected Mean Portfolio: <strong>{formatCurrency(result.projected_mean_value)}</strong>
            </p>
            <p>
              Annualized Volatility: <strong>{formatPercent(result.annualized_volatility)}</strong>
            </p>
            <p>
              Sharpe Estimate: <strong>{result.sharpe_ratio_estimate}</strong>
            </p>
          </div>

          <h3>Stress Scenarios</h3>
          <div className="scenario-table">
            <div className="scenario-header">Scenario</div>
            <div className="scenario-header">Return Shock</div>
            <div className="scenario-header">PnL</div>
            <div className="scenario-header">Portfolio After Shock</div>
            {result.scenarios.map((scenario) => (
              <div className="scenario-row" key={scenario.name}>
                <span>{scenario.name}</span>
                <span>{formatPercent(scenario.shock_return_pct)}</span>
                <span>{formatCurrency(scenario.pnl_amount)}</span>
                <span>{formatCurrency(scenario.portfolio_value)}</span>
              </div>
            ))}
          </div>

          <p className="interpretation">
            Interpretation: VaR is your minimum expected loss in worst-case market states at the
            selected confidence, while expected shortfall shows the average loss when things get
            worse than VaR.
          </p>
        </section>
      )}

      {prediction && (
        <section className="card">
          <h2>Predictive Analysis (Monte Carlo)</h2>
          <div className="result-grid">
            <p>
              Expected End Value: <strong>{formatCurrency(prediction.expected_end_value)}</strong>
            </p>
            <p>
              Expected PnL: <strong>{formatCurrency(prediction.expected_pnl)}</strong>
            </p>
            <p>
              Profit Probability: <strong>{formatPercent(prediction.probability_profit)}</strong>
            </p>
            <p>
              P(10%+ Drawdown):{' '}
              <strong>{formatPercent(prediction.probability_drawdown_10pct)}</strong>
            </p>
          </div>

          <div className="forecast-rail">
            <span
              className="forecast-marker p05"
              style={{ left: '5%' }}
              title={`5th percentile ${formatCurrency(prediction.p05_end_value)}`}
            />
            <span
              className="forecast-marker median"
              style={{ left: '50%' }}
              title={`Median ${formatCurrency(prediction.median_end_value)}`}
            />
            <span
              className="forecast-marker p95"
              style={{ left: '95%' }}
              title={`95th percentile ${formatCurrency(prediction.p95_end_value)}`}
            />
          </div>
          <div className="forecast-labels">
            <span>P05: {formatCurrency(prediction.p05_end_value)}</span>
            <span>Median: {formatCurrency(prediction.median_end_value)}</span>
            <span>P95: {formatCurrency(prediction.p95_end_value)}</span>
          </div>
          <p className="interpretation">
            Simulated {prediction.simulations.toLocaleString()} paths over {prediction.horizon_days}{' '}
            day(s). The rail shows downside-to-upside range of forecasted end values.
          </p>
        </section>
      )}

      <footer>
        <p>API: FastAPI backend at http://127.0.0.1:8000</p>
      </footer>
    </main>
  )
}

export default App
