import React, { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

// Optional Clerk auth. If your project doesn't use Clerk, remove these imports and token usage.
let useAuth: undefined | (() => { getToken: () => Promise<string | null> });
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useAuth = require("@clerk/nextjs").useAuth;
} catch {
  useAuth = undefined;
}

type Instrument = {
  symbol: string;
  name?: string | null;
  asset_class?: string | null;
  currency?: string | null;
  expense_ratio?: number | null;
};

type Position = {
  id?: string;
  account_id?: string;
  symbol: string;
  quantity?: number | null;
  avg_price?: number | null;
  market_price?: number | null;
  market_value?: number | null;
  instrument?: Instrument | null;
};

type Account = {
  account_id: string;
  account_name?: string | null;
  account_purpose?: string | null;
  cash_balance?: number | null;
};

type AccountsResponse =
  | { accounts: Account[] }
  | Account[]
  | { data: Account[] };

type InstrumentsResponse =
  | { instruments: Instrument[] }
  | Instrument[]
  | { data: Instrument[] };

function getApiBase(): string {
  // Prefer explicit env vars commonly used in Next.js deployments.
  // Add yours here if different.
  const fromEnv =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "";
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  // Fallback for your current Render backend (change if needed).
  return "https://alex-ai-rxh3.onrender.com";
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function normalizeAccounts(payload: AccountsResponse): Account[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as any;
    if (Array.isArray(obj.accounts)) return obj.accounts;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

function normalizeInstruments(payload: InstrumentsResponse): Instrument[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as any;
    if (Array.isArray(obj.instruments)) return obj.instruments;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

export default function AnalysisPage() {
  const auth = useAuth ? useAuth() : null;

  const API_URL = useMemo(() => getApiBase(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [positionsByAccount, setPositionsByAccount] = useState<Record<string, Position[]>>({});
  const [instruments, setInstruments] = useState<Record<string, Instrument>>({});

  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("alex_demo_mode");
      setDemoMode(v === "1");
    } catch {
      // ignore
    }
  }, []);

  const saveDemoMode = useCallback((next: boolean) => {
    setDemoMode(next);
    try {
      localStorage.setItem("alex_demo_mode", next ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth?.getToken) {
      const token = await auth.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [auth]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await authHeaders();

      // 1) instruments (optional)
      const instRes = await fetch(`${API_URL}/api/instruments`, { headers });
      if (instRes.ok) {
        const instJson = (await instRes.json()) as InstrumentsResponse;
        const list = normalizeInstruments(instJson);
        const map: Record<string, Instrument> = {};
        for (const i of list) map[i.symbol] = i;
        setInstruments(map);
      } else if (instRes.status !== 404) {
        // ignore 404 if endpoint not deployed
        console.warn("Instruments endpoint returned", instRes.status);
      }

      // 2) accounts
      const accRes = await fetch(`${API_URL}/api/accounts`, { headers });
      if (!accRes.ok) {
        const txt = await accRes.text().catch(() => "");
        throw new Error(`Accounts request failed (${accRes.status}): ${txt}`);
      }
      const accJson = (await accRes.json()) as AccountsResponse;
      const accList = normalizeAccounts(accJson);
      setAccounts(accList);

      // 3) positions per account
      const posMap: Record<string, Position[]> = {};
      for (const acc of accList) {
        const accountId = acc.account_id;
        if (!accountId) continue;

        const posRes = await fetch(`${API_URL}/api/accounts/${accountId}/positions`, { headers });
        if (!posRes.ok) {
          const txt = await posRes.text().catch(() => "");
          console.warn(`Positions request failed for ${accountId} (${posRes.status}):`, txt);
          posMap[accountId] = [];
          continue;
        }

        const posJson = (await posRes.json()) as any;

        // Backend may return either {positions:[...]} or a raw array.
        const list: Position[] =
          Array.isArray(posJson) ? (posJson as Position[]) : toArray<Position>(posJson?.positions);

        // Attach instrument details if we have them.
        posMap[accountId] = list.map((p) => ({
          ...p,
          instrument: p.instrument ?? instruments[p.symbol] ?? null,
        }));
      }
      setPositionsByAccount(posMap);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders, instruments]);

  useEffect(() => {
    // Auto-load on first render
    void loadAll();
  }, [loadAll]);

  const totals = useMemo(() => {
    let accountsCount = accounts.length;
    let positionsCount = 0;
    let totalMarketValue = 0;

    for (const acc of accounts) {
      const list = positionsByAccount[acc.account_id] ?? [];
      positionsCount += list.length;
      for (const p of list) {
        const mv = typeof p.market_value === "number" ? p.market_value : null;
        if (mv != null && !Number.isNaN(mv)) totalMarketValue += mv;
      }
    }

    return { accountsCount, positionsCount, totalMarketValue };
  }, [accounts, positionsByAccount]);

  return (
    <>
      <Head>
        <title>Analysis</title>
      </Head>

      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Analysis</h1>
            <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
              API: <code>{API_URL}</code>
            </div>
          </div>

          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/advisor-team">Advisor team</Link>
          </nav>
        </header>

        <section style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => void loadAll()}
            disabled={loading}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {loading ? "Carregando..." : "Recarregar"}
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => saveDemoMode(e.target.checked)}
            />
            Demo mode
          </label>

          <div style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><strong>Accounts:</strong> {totals.accountsCount}</span>
            <span><strong>Positions:</strong> {totals.positionsCount}</span>
            <span><strong>Total MV:</strong> {totals.totalMarketValue.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}</span>
          </div>
        </section>

        {error && (
          <div style={{ marginTop: 16, padding: 12, border: "1px solid #f5c2c7", background: "#f8d7da", borderRadius: 10 }}>
            <strong>Erro:</strong> {error}
          </div>
        )}

        <section style={{ marginTop: 18 }}>
          <h2 style={{ margin: "12px 0" }}>Accounts & Positions</h2>

          {accounts.length === 0 && !loading && (
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, opacity: 0.8 }}>
              Nenhuma conta encontrada.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            {accounts.map((acc) => {
              const list = positionsByAccount[acc.account_id] ?? [];
              const cash = typeof acc.cash_balance === "number" ? acc.cash_balance : 0;

              const mv = list.reduce((sum, p) => sum + (typeof p.market_value === "number" ? p.market_value : 0), 0);

              return (
                <div key={acc.account_id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{acc.account_name ?? "Account"}</div>
                      <div style={{ fontSize: 13, opacity: 0.75 }}>{acc.account_purpose ?? ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, opacity: 0.75 }}>Cash</div>
                      <div style={{ fontWeight: 700 }}>
                        {cash.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, opacity: 0.75 }}>Positions MV</span>
                    <strong>{mv.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}</strong>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                          <th style={{ paddingBottom: 6 }}>Symbol</th>
                          <th style={{ paddingBottom: 6 }}>Qty</th>
                          <th style={{ paddingBottom: 6, textAlign: "right" }}>MV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "10px 0", opacity: 0.7 }}>
                              Sem posições.
                            </td>
                          </tr>
                        ) : (
                          list.map((p, idx) => (
                            <tr key={`${p.symbol}-${idx}`} style={{ borderBottom: "1px solid #f5f5f5" }}>
                              <td style={{ padding: "8px 0" }}>
                                <div style={{ fontWeight: 600 }}>{p.symbol}</div>
                                {p.instrument?.name ? (
                                  <div style={{ fontSize: 12, opacity: 0.75 }}>{p.instrument.name}</div>
                                ) : null}
                              </td>
                              <td style={{ padding: "8px 0" }}>{(p.quantity ?? 0).toLocaleString("pt-BR")}</td>
                              <td style={{ padding: "8px 0", textAlign: "right" }}>
                                {(p.market_value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "USD" })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {demoMode && (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                      <div><strong>Account ID:</strong> <code>{acc.account_id}</code></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <footer style={{ marginTop: 32, fontSize: 12, opacity: 0.7 }}>
          Se aparecer erro tipo <code>h.filter is not a function</code>, quase sempre é porque a API retornou um objeto
          onde a UI esperava um array. Esta página já trata ambos formatos: array direto ou {"{positions: [...]}"}.
        </footer>
      </div>
    </>
  );
}
