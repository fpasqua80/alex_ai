import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { isDemoMode } from "../lib/demoMode";
import { DEMO_ANALYSIS_JOB } from "../lib/demoAnalysis";

/* ------------------------------
   Types
------------------------------ */

type ChartDatum = {
  name?: string;
  value?: number;
  date?: string;
  [key: string]: any;
};

type ChartDefinition = {
  title?: string;
  type?: "pie" | "bar" | "line";
  data?: ChartDatum[] | null;
};

type AnalysisJob = {
  id: string;
  status: "completed" | "failed" | "running" | "pending";
  report_payload?: {
    content: string;
  };
  charts_payload?: Record<string, ChartDefinition> | null;
  error_message?: string;
};

/* ------------------------------
   Helpers
------------------------------ */

const currency = (v: any) =>
  typeof v === "number" && Number.isFinite(v)
    ? `$${v.toLocaleString("en-US")}`
    : "";

const SafeTooltip = ({ active, payload, label }: any) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  return (
    <div className="bg-white border rounded shadow p-2 text-sm">
      <p className="font-semibold">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i}>
          {p.name}: {currency(p.value)}
        </p>
      ))}
    </div>
  );
};

/* ------------------------------
   Page
------------------------------ */

export default function AnalysisPage() {
  const router = useRouter();
  const { getToken } = useAuth();

  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode()) {
      setJob(DEMO_ANALYSIS_JOB as AnalysisJob);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const token = await getToken();

        const res = await fetch(`${API_URL}/api/analysis`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to load analysis");
        }

        const data = await res.json();
        setJob(data);
      } catch (err: any) {
        setJob({
          id: "error",
          status: "failed",
          error_message: err?.message ?? "Unexpected error",
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [getToken]);

  if (loading) {
    return (
      <Layout>
        <div className="p-12 text-center text-gray-500">
          Loading analysis…
        </div>
      </Layout>
    );
  }

  if (!job || job.status === "failed") {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto p-12">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Analysis Failed
          </h2>
          <p className="text-gray-600 mb-6">
            {job?.error_message ?? "Unknown error"}
          </p>
          <button
            onClick={() => router.push("/advisor-team")}
            className="px-6 py-3 bg-primary text-white rounded"
          >
            Back
          </button>
        </div>
      </Layout>
    );
  }

  const charts = job.charts_payload ?? {};

  return (
    <Layout>
      <Head>
        <title>Portfolio Analysis</title>
      </Head>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* Report */}
        {job.report_payload?.content && (
          <div className="prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {job.report_payload.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Charts */}
        {Object.entries(charts).map(([key, chart]) => {
          if (!Array.isArray(chart.data) || chart.data.length === 0) return null;

          const type = chart.type ?? "bar";

          return (
            <div key={key} className="bg-white p-6 rounded shadow">
              <h3 className="text-lg font-semibold mb-4">
                {chart.title ?? "Chart"}
              </h3>

              <ResponsiveContainer width="100%" height={300}>
                {type === "pie" ? (
                  <PieChart>
                    <Pie
                      data={chart.data}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={120}
                    >
                      {chart.data.map((_, i) => (
                        <Cell key={i} />
                      ))}
                    </Pie>
                    <Tooltip content={<SafeTooltip />} />
                  </PieChart>
                ) : type === "line" ? (
                  <LineChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<SafeTooltip />} />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" />
                  </LineChart>
                ) : (
                  <BarChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip content={<SafeTooltip />} />
                    <Bar dataKey="value" fill="#2563eb" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
