// Demo analysis payload used when demo mode is enabled.
// This is imported by pages/analysis.tsx as ../lib/demoAnalysis

export const DEMO_ANALYSIS_JOB = {
  id: "demo-job-001",
  created_at: new Date().toISOString(),
  status: "completed",
  job_type: "portfolio_analysis",
  report_payload: {
    agent: "demo",
    generated_at: new Date().toISOString(),
    content: [
      "# Demo Report",
      "",
      "This is a demo analysis report generated in the frontend (demo mode).",
      "",
      "## What you can do next",
      "- Disable demo mode to load real data from the backend",
      "- Connect your Clerk user and create accounts/positions",
      "",
      "## Notes",
      "This is safe placeholder content so the UI can render end-to-end.",
    ].join("\n"),
  },
  charts_payload: {},
  retirement_payload: {
    agent: "demo",
    generated_at: new Date().toISOString(),
    analysis: "Demo retirement analysis (enable real backend to generate this).",
  },
} as const;
