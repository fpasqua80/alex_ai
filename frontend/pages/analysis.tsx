import { isDemoMode } from "../lib/demoMode";
import { DEMO_ANALYSIS_JOB } from "../lib/demoAnalysis";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import Layout from '../components/Layout';
import { API_URL } from '../lib/config';
import Head from 'next/head';

// -----------------------------
// Option A (no /api/jobs backend)
// -----------------------------
// Your FastAPI exposes /api/user, /api/accounts, /api/accounts/{account_id}/positions, /api/positions (but may be POST-only).
// It does NOT expose /api/jobs or /api/analyze, so this page builds a local analysis from the positions endpoints.

interface Job {
  id: string;
  created_at: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  job_type: string;
  report_payload?: {
    agent: string;
    content: string;
    generated_at: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  charts_payload?: Record<string, any> | null;
  retirement_payload?: {
    agent: string;
    analysis: string;
    generated_at: string;
  };
  error_message?: string;
}

type TabType = 'overview' | 'charts' | 'retirement';

// Color palette for charts
const COLORS = [
  '#209DD7', // primary
  '#753991', // AI accent
  '#FFB707', // accent
  '#062147', // dark
  '#60A5FA', // light blue
  '#A78BFA', // light purple
  '#FBBF24', // yellow
  '#34D399', // green
  '#F87171', // red
  '#94A3B8', // gray
];

// ✅ Safe formatter for Recharts Tooltip (handles number | string | undefined)
const currencyFormatter = (value?: number | string) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return `$${n.toLocaleString("en-US")}`;
};

// Best-effort field pickers (kept flexible because backend schema may vary)
const pickSymbol = (p: Record<string, any>) =>
  p.symbol || p.ticker || p.instrument_symbol || p.instrument?.symbol || p.instrument?.ticker || p.instrument?.name || 'Unknown';

const pickValue = (p: Record<string, any>) => {
  const mv = p.market_value ?? p.marketValue ?? p.current_value ?? p.currentValue ?? p.value;
  if (Number.isFinite(Number(mv))) return Number(mv);

  const qty = p.quantity ?? p.qty ?? p.shares;
  const price = p.price ?? p.current_price ?? p.currentPrice ?? p.last_price ?? p.lastPrice;
  const nqty = Number(qty);
  const nprice = Number(price);
  if (Number.isFinite(nqty) && Number.isFinite(nprice)) return nqty * nprice;

  return 0;
};

const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function fetchJsonWithDetails(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { res, data, text };
}

export default function Analysis() {
  const router = useRouter();
  const { getToken } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (isDemoMode()) {
      setJob(DEMO_ANALYSIS_JOB);
      setLoading(false);
      return;
    }
    
    const loadFromBackend = async () => {
      try {
        const token = await getToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        // Discover which endpoint supports GET for positions (your /api/positions might be POST-only -> 405)
        const { res: openapiRes, data: openapiData, text: openapiText } = await fetchJsonWithDetails(`${API_URL}/openapi.json`);
        if (!openapiRes.ok || !openapiData?.paths) {
          throw new Error(`Failed to read OpenAPI (${openapiRes.status}): ${openapiData?.detail || openapiData?.message || openapiText || openapiRes.statusText}`);
        }

        const paths = openapiData.paths as Record<string, any>;
        const supports = (path: string, method: string) => {
          const p = paths?.[path];
          if (!p) return false;
          return Boolean(p[method.toLowerCase()]);
        };

        let positions: Record<string, any>[] = [];

        if (supports('/api/positions', 'get')) {
          const { res, data, text } = await fetchJsonWithDetails(`${API_URL}/api/positions`, { headers });
          if (!res.ok) throw new Error(`Failed to load positions (${res.status}): ${data?.detail || data?.message || text || res.statusText}`);
          positions = Array.isArray(data) ? data : (data?.positions ?? []);
        } else if (supports('/api/accounts', 'get') && supports('/api/accounts/{account_id}/positions', 'get')) {
          // Load accounts, pick the first one, then load its positions.
          const { res: aRes, data: aData, text: aText } = await fetchJsonWithDetails(`${API_URL}/api/accounts`, { headers });
          if (!aRes.ok) throw new Error(`Failed to load accounts (${aRes.status}): ${aData?.detail || aData?.message || aText || aRes.statusText}`);

          const accounts: any[] = Array.isArray(aData) ? aData : (aData?.accounts ?? []);
          const first = accounts?.[0];
          const accountId = first?.id || first?.account_id || first?.uuid;

          if (!accountId) {
            throw new Error(`Accounts loaded but could not determine account id. Response shape: ${JSON.stringify(aData).slice(0, 500)}...`);
          }

          const url = `${API_URL}/api/accounts/${encodeURIComponent(String(accountId))}/positions`;
          const { res: pRes, data: pData, text: pText } = await fetchJsonWithDetails(url, { headers });
          if (!pRes.ok) throw new Error(`Failed to load account positions (${pRes.status}): ${pData?.detail || pData?.message || pText || pRes.statusText}`);
          positions = Array.isArray(pData) ? pData : (pData?.positions ?? []);
        } else {
          const available = Object.keys(paths).sort().join(', ');
          throw new Error(
            `Could not find a GET positions endpoint in OpenAPI. Available paths: ${available}`
          );
        }

        const nowIso = new Date().toISOString();

        // Aggregate by symbol
        const totalsBySymbol = new Map<string, number>();
        for (const p of positions) {
          const sym = String(pickSymbol(p));
          const val = pickValue(p);
          totalsBySymbol.set(sym, (totalsBySymbol.get(sym) || 0) + (Number.isFinite(val) ? val : 0));
        }

        const rows = Array.from(totalsBySymbol.entries())
          .map(([name, value]) => ({ name, value }))
          .filter(r => Number.isFinite(r.value) && r.value > 0)
          .sort((a, b) => b.value - a.value);

        const total = rows.reduce((acc, r) => acc + r.value, 0);
        const top = rows.slice(0, 10);
        const top5 = rows.slice(0, 5);

        const mdTable = (items: {name: string; value: number}[]) => {
          if (!items.length) return '_No holdings found._';
          const header = `| Holding | Value | Weight |\n|---|---:|---:|`;
          const body = items.map(i => {
            const w = total > 0 ? (i.value / total) : 0;
            return `| ${i.name} | ${fmtMoney(i.value)} | ${(w*100).toFixed(2)}% |`;
          }).join('\n');
          return `${header}\n${body}`;
        };

        const report = [
          `# Portfolio Overview`,
          ``,
          total > 0
            ? `**Estimated total market value:** ${fmtMoney(total)}`
            : `No position values found yet. Add positions to see analysis.`,
          ``,
          `## Top Holdings`,
          mdTable(top5),
          ``,
          `## Notes`,
          `- This report is generated locally from your positions endpoints because the backend does not provide /api/jobs.`,
        ].join('\n');

        const charts_payload = total > 0 ? {
          allocation_by_holding: {
            title: 'Top Holdings Allocation',
            type: 'donut',
            data: top.map((r) => ({ name: r.name, value: r.value })),
          },
          top_holdings_value: {
            title: 'Top Holdings by Value',
            type: 'bar',
            data: top.map((r) => ({ name: r.name, value: r.value })),
          }
        } : {};

        const localJob: Job = {
          id: `local_${Date.now()}`,
          created_at: nowIso,
          status: 'completed',
          job_type: 'local_portfolio_analysis',
          report_payload: {
            agent: 'Local Analyzer',
            content: report,
            generated_at: nowIso,
          },
          charts_payload,
          retirement_payload: {
            agent: 'Local Retirement Planner',
            analysis: `No retirement projection available (requires server-side model).`,
            generated_at: nowIso,
          }
        };

        setJob(localJob);
      } catch (error) {
        console.error('Error loading analysis inputs:', error);
        setJob({
          id: `local_${Date.now()}`,
          created_at: new Date().toISOString(),
          status: 'failed',
          job_type: 'local_portfolio_analysis',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        setLoading(false);
      }
    };

    if (router.isReady) loadFromBackend();
  }, [router.isReady, getToken]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow px-8 py-12 text-center">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!job) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow px-8 py-12 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                No Analysis Available
              </h2>
              <p className="text-gray-600 mb-6">
                No data available yet. Add positions to see results here.
              </p>
              <button
                onClick={() => router.push('/advisor-team')}
                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-blue-600 font-semibold"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (job.status === 'failed') {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow px-8 py-12">
              <h2 className="text-2xl font-bold text-red-600 mb-4">Analysis Failed</h2>
              <p className="text-gray-600 mb-4">
                We could not load positions using the available GET endpoints.
              </p>
              {job.error_message && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-800">{job.error_message}</p>
                </div>
              )}
              <button
                onClick={() => router.push('/advisor-team')}
                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-blue-600 font-semibold"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Tab content renderers
  const renderOverview = () => {
    const report = job?.report_payload?.content;
    if (!report) {
      return (
        <div className="text-center py-12 text-gray-500">
          No portfolio report available.
        </div>
      );
    }

    return (
      <div className="prose prose-lg max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            h1: ({children}) => <h1 className="text-3xl font-bold mb-4 text-gray-900">{children}</h1>,
            h2: ({children}) => <h2 className="text-2xl font-semibold mb-3 text-gray-800 mt-6">{children}</h2>,
            h3: ({children}) => <h3 className="text-xl font-medium mb-2 text-gray-700 mt-4">{children}</h3>,
            ul: ({children}) => <ul className="list-disc ml-6 mb-4 space-y-1">{children}</ul>,
            ol: ({children}) => <ol className="list-decimal ml-6 mb-4 space-y-1">{children}</ol>,
            li: ({children}) => <li className="text-gray-700">{children}</li>,
            p: ({children}) => <p className="mb-4 text-gray-700 leading-relaxed">{children}</p>,
            table: ({children}) => (
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse">{children}</table>
              </div>
            ),
            thead: ({children}) => <thead className="bg-gray-100">{children}</thead>,
            th: ({children}) => <th className="p-3 text-left font-semibold border border-gray-300">{children}</th>,
            td: ({children}) => <td className="p-3 border border-gray-300">{children}</td>,
            strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
            blockquote: ({children}) => (
              <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-gray-600">
                {children}
              </blockquote>
            ),
          }}
        >
          {report}
        </ReactMarkdown>
      </div>
    );
  };

  const renderCharts = () => {
    const chartsPayload = job?.charts_payload;
    if (!chartsPayload || Object.keys(chartsPayload).length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          No chart data available.
        </div>
      );
    }

    const formatTitle = (key: string): string => {
      return key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getChartType = (chartData: any): 'pie' | 'donut' | 'bar' | 'horizontalBar' | 'line' => {
      if (chartData.type) {
        const supportedTypes = ['pie', 'donut', 'bar', 'horizontalBar', 'line'];
        if (supportedTypes.includes(chartData.type)) return chartData.type;
        const typeMap: Record<string, 'pie' | 'donut' | 'bar' | 'horizontalBar' | 'line'> = { column: 'bar', area: 'line' };
        if (typeMap[chartData.type]) return typeMap[chartData.type];
      }
      if (chartData.data?.[0]?.date || chartData.data?.[0]?.year) return 'line';
      if (chartData.data?.length <= 10 && chartData.data?.[0]?.value) return 'pie';
      return 'bar';
    };

    const chartEntries = Object.entries(chartsPayload);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {chartEntries.map(([key, chartData]: [string, any]) => {
          if (!chartData?.data || chartData.data.length === 0) return null;

          const chartType = getChartType(chartData);
          const title = chartData.title || formatTitle(key);

          return (
            <div key={key} className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">{title}</h3>
              <ResponsiveContainer width="100%" height={300}>
                {chartType === 'pie' || chartType === 'donut' ? (
                  <PieChart>
                    <Pie
                      data={chartData.data}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label
                      outerRadius={100}
                      innerRadius={chartType === 'donut' ? 60 : 0}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {chartData.data.map((entry: any, idx: number) => (
                        <Cell key={`cell-${idx}`} fill={entry.color || COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={currencyFormatter} />
                  </PieChart>
                ) : chartType === 'horizontalBar' ? (
                  <BarChart data={chartData.data} margin={{ left: 10, right: 30, top: 5, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
                    <YAxis tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`} />
                    <Tooltip formatter={currencyFormatter} />
                    <Bar dataKey="value">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {chartData.data?.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : chartType === 'bar' ? (
                  <BarChart data={chartData.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`} />
                    <Tooltip formatter={currencyFormatter} />
                    <Bar dataKey="value" fill={chartData.color || COLORS[0]} />
                  </BarChart>
                ) : (
                  <LineChart data={chartData.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={chartData.xKey || "year"} />
                    <YAxis tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`} />
                    <Tooltip formatter={currencyFormatter} />
                    <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    );
  };

  const renderRetirement = () => {
    const retirement = job?.retirement_payload;
    if (!retirement) {
      return (
        <div className="text-center py-12 text-gray-500">
          No retirement projection available.
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="bg-ai-accent/10 border border-ai-accent/20 rounded-lg p-6">
          <div className="prose prose-lg max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {retirement.analysis}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Analysis - Alex AI Financial Advisor</title>
      </Head>
      <Layout>
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow px-8 py-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-dark mb-2">Portfolio Analysis Results</h1>
                  <p className="text-gray-600">
                    Completed on {formatDate(job.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => router.push('/advisor-team')}
                  className="px-6 py-3 bg-ai-accent text-white rounded-lg hover:bg-purple-700 font-semibold"
                >
                  New Analysis
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow mb-8">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`py-3 px-8 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'overview'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    📊 Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('charts')}
                    className={`py-3 px-8 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'charts'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    📈 Charts
                  </button>
                  <button
                    onClick={() => setActiveTab('retirement')}
                    className={`py-3 px-8 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'retirement'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    🎯 Retirement Projection
                  </button>
                </nav>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow px-8 py-6">
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'charts' && renderCharts()}
              {activeTab === 'retirement' && renderRetirement()}
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}
