import Head from "next/head";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";

type Account = {
  id: string;
  account_name?: string;
  account_purpose?: string | null;
  cash_balance?: number | string | null;
};

type Position = {
  id: string;
  symbol: string;
  quantity: number;
  avg_price?: number | null;
  market_value?: number | null;
};

type AccountWithPositions = Account & { positions: Position[] };

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export default function AccountsPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountWithPositions[]>([]);

  const canCallApi = useMemo(
    () => Boolean(API_URL) && isLoaded && isSignedIn,
    [isLoaded, isSignedIn]
  );

  const fetchAccounts = useCallback(async () => {
    if (!API_URL) {
      setError("NEXT_PUBLIC_API_URL não configurado no frontend.");
      return;
    }
    if (!isLoaded) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const resp = await fetch(`${API_URL}/api/accounts`, { headers });
      if (!resp.ok) throw new Error(`Falha ao listar contas (HTTP ${resp.status})`);

      const accJson = await resp.json();
      const accs = safeArray<Account>(accJson);

      const withPos: AccountWithPositions[] = await Promise.all(
        accs.map(async (a) => {
          try {
            const r = await fetch(`${API_URL}/api/accounts/${a.id}/positions`, { headers });
            if (!r.ok) return { ...a, positions: [] };
            const pj = await r.json();
            return { ...a, positions: safeArray<Position>(pj) };
          } catch {
            return { ...a, positions: [] };
          }
        })
      );

      console.log("Final accounts with positions:", withPos);
      setAccounts(withPos);
    } catch (e: any) {
      setError(e?.message || String(e));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, isLoaded]);

  useEffect(() => {
    if (canCallApi) fetchAccounts();
  }, [canCallApi, fetchAccounts]);

  const deleteAccount = useCallback(
    async (accountId: string) => {
      if (!API_URL) return;
      if (!isLoaded) return;

      const ok = window.confirm("Deseja realmente excluir esta conta?");
      if (!ok) return;

      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const resp = await fetch(`${API_URL}/api/accounts/${accountId}`, {
          method: "DELETE",
          headers,
        });
        if (!resp.ok) throw new Error(`Falha ao excluir (HTTP ${resp.status})`);

        setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      } catch (e: any) {
        alert(e?.message || String(e));
      }
    },
    [getToken, isLoaded]
  );

  return (
    <>
      <Head>
        <title>Accounts</title>
      </Head>

      <div
        style={{
          padding: 24,
          maxWidth: 1100,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Accounts</h1>

        {!API_URL && (
          <div
            style={{
              padding: 12,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            Configure <code>NEXT_PUBLIC_API_URL</code> no Stormkit (ex:{" "}
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={fetchAccounts} disabled={!canCallApi || loading} style={{ padding: "8px 12px" }}>
            {loading ? "Carregando..." : "Recarregar"}
          </button>
        </div>

        {loading && <div style={{ opacity: 0.8 }}>Carregando...</div>}

        {!loading && accounts.length === 0 && <div style={{ opacity: 0.8 }}>Nenhuma conta.</div>}

        {!loading && accounts.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{a.account_name || "Conta"}</div>
                    {a.account_purpose && <div style={{ opacity: 0.8, fontSize: 13 }}>{a.account_purpose}</div>}
                  </div>

                  <button onClick={() => deleteAccount(a.id)} style={{ padding: "6px 10px" }}>
                    Delete
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Positions</div>

                  {a.positions.length === 0 ? (
                    <div style={{ opacity: 0.8, fontSize: 13 }}>Sem posições.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.85 }}>
                          <th style={{ padding: "6px 4px" }}>Symbol</th>
                          <th style={{ padding: "6px 4px" }}>Qty</th>
                          <th style={{ padding: "6px 4px" }}>Avg</th>
                          <th style={{ padding: "6px 4px" }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.positions.map((p) => (
                          <tr key={p.id} style={{ borderTop: "1px solid #eef2f7" }}>
                            <td style={{ padding: "6px 4px" }}>{p.symbol}</td>
                            <td style={{ padding: "6px 4px" }}>{p.quantity}</td>
                            <td style={{ padding: "6px 4px" }}>{p.avg_price ?? "—"}</td>
                            <td style={{ padding: "6px 4px" }}>{p.market_value ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
