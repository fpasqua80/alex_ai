export const DEMO_ANALYSIS_JOB = {
    id: "demo_job_001",
    created_at: new Date().toISOString(),
    status: "completed",
    job_type: "portfolio_analysis",
  
    report_payload: {
      agent: "AI Financial Advisor",
      generated_at: new Date().toISOString(),
      content: `
  # Portfolio Overview
  
  **Estimated total market value:** $128,450
  
  ## Asset Allocation
  - US Equities: 62%
  - International Equities: 18%
  - Fixed Income: 12%
  - Crypto Assets: 8%
  
  ## Top Holdings
  | Asset | Value | Allocation |
  |------|-------|------------|
  | SPY  | $45,000 | 35.0% |
  | QQQ  | $28,400 | 22.1% |
  | AAPL | $18,600 | 14.5% |
  | MSFT | $16,200 | 12.6% |
  | BTC  | $10,250 | 8.0% |
  
  ## Insights
  - Portfolio is **growth-oriented**, with high tech exposure.
  - Diversification is good, but volatility may be elevated.
  - Crypto exposure is aggressive for conservative profiles.
  
  ## Recommendations
  - Consider reallocating 5–10% into fixed income.
  - Reduce concentration risk in mega-cap tech.
  - Maintain long-term discipline.
  `
    },
  
    charts_payload: {
      allocation_donut: {
        title: "Portfolio Allocation",
        type: "donut",
        data: [
          { name: "US Stocks", value: 79600 },
          { name: "International Stocks", value: 23100 },
          { name: "Fixed Income", value: 15400 },
          { name: "Crypto", value: 10350 }
        ]
      },
  
      top_holdings_bar: {
        title: "Top Holdings by Value",
        type: "bar",
        data: [
          { name: "SPY", value: 45000 },
          { name: "QQQ", value: 28400 },
          { name: "AAPL", value: 18600 },
          { name: "MSFT", value: 16200 },
          { name: "BTC", value: 10250 }
        ]
      }
    },
  
    retirement_payload: {
      agent: "Retirement Planner",
      generated_at: new Date().toISOString(),
      analysis: `
  ### Retirement Outlook (Demo)
  
  Based on your current portfolio growth rate:
  
  - **Estimated retirement age:** 62
  - **Projected monthly income:** $4,200
  - **Risk level:** Medium–High
  
  📌 To improve retirement readiness:
  - Increase fixed income allocation over time
  - Rebalance annually
  - Increase monthly contributions by 5–10%
  `
    }
  };
  
