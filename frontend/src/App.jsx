import { useMemo, useState } from 'react'
import './App.css'

function App() {
  const [portfolioValue, setPortfolioValue] = useState(250000)
  const [dailyVolatility, setDailyVolatility] = useState(0.018)
  const [confidence, setConfidence] = useState(0.95)
  const [horizonDays, setHorizonDays] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const canRun = useMemo(() => {
    return portfolioValue > 0 && dailyVolatility > 0 && horizonDays > 0
  }, [portfolioValue, dailyVolatility, horizonDays])

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
        <p>Quick Value-at-Risk sandbox for trading portfolio experiments.</p>
      </header>

      <section className="card">
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
            Daily Volatility (decimal)
            <input
              type="number"
              value={dailyVolatility}
              onChange={(event) => setDailyVolatility(event.target.value)}
              min="0.001"
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
          <h2>Results</h2>
          <div className="result-grid">
            <p>
              One-Day VaR: <strong>${result.var_amount.toLocaleString()}</strong>
            </p>
            <p>
              Expected Shortfall:{' '}
              <strong>${result.expected_shortfall.toLocaleString()}</strong>
            </p>
            <p>
              Confidence: <strong>{(result.confidence_level * 100).toFixed(0)}%</strong>
            </p>
            <p>
              Horizon: <strong>{result.horizon_days} day(s)</strong>
            </p>
          </div>
        </section>
      )}

      <footer>
        <p>API: FastAPI backend at http://127.0.0.1:8000</p>
      </footer>
    </main>
  )
}

export default App
