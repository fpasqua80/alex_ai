import Head from "next/head";
import { useAuth } from "@clerk/nextjs";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type Severity = "critical" | "high" | "medium" | "low" | "info";

type Finding = {
  id: string;
  title: string;
  severity: Severity;
  description?: string;
  recommendation?: string;
};

type AnalysisResponse = {
  summary: string;
  findings: Finding[];
};

const DEFAULT_API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeSeverity(s: unknown): Severity {
  const v = String(s || "").toLowerCase();
  if (v === "critical" || v === "high" || v === "medium" || v === "low" || v === "info") {
    return v as Severity;
  }
  return "info";
}

function demoAnalysis(): AnalysisResponse {
  return {
    summary:
      "Demo: análise de exemplo (para validar a UI). Para resultados reais, configure o backend e rode uma análise.",
    findings: [
      {
        id: "F-001",
        title: "Uso de segredo sem rotação",
        severity: "medium",
        description: "Chaves/segredos devem ser rotacionados e nunca commitados.",
        recommendation: "Use secret manager + rotação periódica.",
      },
      {
        id: "F-002",
        title: "Falta de validação de input",
        severity: "high",
        description: "Inputs sem validação podem causar falhas e vulnerabilidades.",
        recommendation: "Valide com Pydantic e retorne 422 com mensagens claras.",
      },
    ],
  };
}

export default function AnalysisPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [apiUrl] = useState<string>(DEFAULT_API_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalysisResponse | null>(null);

  const canCallApi = useMemo(
    () => Boolean(apiUrl) && isLoaded && isSignedIn,
    [apiUrl, isLoaded, isSignedIn]
  );

  const runDemo = useCallback(() => {
    setError(null);
    setData(demoAnalysis());
  }, []);

  const runApi = useCallback(async () => {
    if (!apiUrl) {
      setError("NEXT_PUBLIC_API_URL não configurado no frontend.");
      return;
    }
    if (!isLoaded) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();

      // Ajuste esse endpoint se o seu backend tiver outro path
      const resp = await fetch(`${apiUrl}/api/analysis/demo`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? ` - ${text}` : ""}`);
      }

      const json = (await resp.json()) as Partial<AnalysisResponse>;

      setData({
        summary: String(json.summary || ""),
        findings: safeArray<Finding>(json.findings).map((f, idx) => ({
          id: String((f as any)?.id || `F-${idx + 1}`),
          title: String((f as any)?.title || "Finding"),
          severity: normalizeSeverity((f as any)?.severity),
          description: (f as any)?.description ? String((f as any)?.description) : undefined,
          recommendation: (f as any)?.recommendation ? String((f as any)?.recommendation) : undefined,
        })),
      });
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, getToken, isLoaded]);

  useEffect(() => {
    if (!apiUrl) runDemo();
  }, [apiUrl, runDemo]);

  const findings = data?.findings ?? [];
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) c[normalizeSeverity(f.severity)] += 1;
    return c;
  }, [findings]);

  return (
    <>
      <Head>
        <title>Analysis</title>
      </Head>

      <div
        style={{
          padding: 24,
          maxWidth: 1100,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Security Analysis</h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={runDemo} style={{ padding: "8px 12px" }}>
            Carregar demo
          </button>
          <button onClick={runApi} disabled={!canCallApi || loading} style={{ padding: "8px 12px" }}>
            {loading ? "Executando..." : "Buscar do backend"}
          </button>
        </div>

        {!apiUrl && (
          <div
            style={{
              padding: 12,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <strong>Observação:</strong> configure <code>NEXT_PUBLIC_API_URL</code> no Stormkit (ex:{" "}
            <code>https://alex-ai-rxh3.onrender.com</code>).
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <strong>Erro:</strong> {error}
          </div>
        )}

        {data && (
          <div
            style={{
              padding: 12,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <strong>Resumo:</strong> {data.summary || "—"}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, opacity: 0.9 }}>
              <span>Critical: {counts.critical}</span>
              <span>High: {counts.high}</span>
              <span>Medium: {counts.medium}</span>
              <span>Low: {counts.low}</span>
              <span>Info: {counts.info}</span>
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Findings</h2>

        {findings.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Nenhum finding.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {findings.map((f) => (
              <div key={f.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700 }}>{f.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{f.severity.toUpperCase()}</div>
                </div>
                {f.description && <p style={{ marginTop: 8, marginBottom: 0 }}>{f.description}</p>}
                {f.recommendation && (
                  <p style={{ marginTop: 8, marginBottom: 0 }}>
                    <strong>Recomendação:</strong> {f.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
