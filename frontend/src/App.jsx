import { useMemo, useState } from 'react'
import './App.css'

const formatCurrency = (value) =>
  Number(value).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

const formatPercent = (value) => `${Number(value).toFixed(2)}%`

function App() {
  const [portfolioValue, setPortfolioValue] = useState(250000)
  const [dailyVolatility, setDailyVolatility] = useState(0.018)
  const [expectedDailyReturn, setExpectedDailyReturn] = useState(0.0008)
  const [riskFreeRateAnnual, setRiskFreeRateAnnual] = useState(0.04)
  const [confidence, setConfidence] = useState(0.95)
  const [horizonDays, setHorizonDays] = useState(5)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const canRun = useMemo(() => {
    return (
      portfolioValue > 0 &&
      dailyVolatility > 0 &&
      confidence > 0.5 &&
      confidence < 1 &&
      horizonDays > 0
    )
  }, [portfolioValue, dailyVolatility, confidence, horizonDays])

  const runRisk = async () => {
    setError('')
    setLoading(true)
    try {
      const response = await fetch('http://127.0.0.1:8000/risk/var', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portfolio_value: Number(portfolioValue),
          daily_volatility: Number(dailyVolatility),
          expected_daily_return: Number(expectedDailyReturn),
          risk_free_rate_annual: Number(riskFreeRateAnnual),
          confidence_level: Number(confidence),
          horizon_days: Number(horizonDays),
        }),
      })

      if (!response.ok) {
        throw new Error('Unable to calculate risk. Check backend status.')
      }

      const data = await response.json()
      setResult(data)
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Fintech Risk Lab</h1>
        <p>Portfolio risk analytics with VaR, ES, Sharpe, and stress scenarios.</p>
      </header>

      <section className="card">
        <h2>Inputs</h2>
        <div className="grid">
          <label>
            Portfolio Value ($)
            <input
              type="number"
              value={portfolioValue}
              onChange={(event) => setPortfolioValue(event.target.value)}
              min="1"
              step="1000"
            />
          </label>
          <label>
            Daily Volatility (decimal, ex: 0.018)
            <input
              type="number"
              value={dailyVolatility}
              onChange={(event) => setDailyVolatility(event.target.value)}
              min="0.001"
              step="0.001"
            />
          </label>
          <label>
            Expected Daily Return (decimal)
            <input
              type="number"
              value={expectedDailyReturn}
              onChange={(event) => setExpectedDailyReturn(event.target.value)}
              min="-0.2"
              max="0.2"
              step="0.0001"
            />
          </label>
          <label>
            Risk-Free Rate (annual decimal)
            <input
              type="number"
              value={riskFreeRateAnnual}
              onChange={(event) => setRiskFreeRateAnnual(event.target.value)}
              min="0"
              max="1"
              step="0.001"
            />
          </label>
          <label>
            Confidence Level
            <select
              value={confidence}
              onChange={(event) => setConfidence(event.target.value)}
            >
              <option value="0.9">90%</option>
              <option value="0.95">95%</option>
              <option value="0.99">99%</option>
            </select>
          </label>
          <label>
            Horizon (days)
            <input
              type="number"
              value={horizonDays}
              onChange={(event) => setHorizonDays(event.target.value)}
              min="1"
              step="1"
            />
          </label>
        </div>

        <button disabled={!canRun || loading} onClick={runRisk}>
          {loading ? 'Running...' : 'Run Risk Check'}
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

      <footer>
        <p>API: FastAPI backend at http://127.0.0.1:8000</p>
      </footer>
    </main>
  )
}

export default App
