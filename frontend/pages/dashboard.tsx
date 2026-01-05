import { useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import { API_URL } from "../lib/config";
import Layout from "../components/Layout";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Skeleton, SkeletonCard } from "../components/Skeleton";
import { showToast } from "../components/Toast";
import Head from "next/head";

interface UserData {
  clerk_user_id: string;
  display_name: string;
  years_until_retirement: number;
  target_retirement_income: number;
  asset_class_targets: Record<string, number>;
  region_targets: Record<string, number>;
}

interface Account {
  account_id: string;
  clerk_user_id: string;
  account_name: string;
  account_type: string;
  account_purpose: string;
  cash_balance: number;
  created_at: string;
  updated_at: string;
}

interface Instrument {
  symbol: string;
  name: string;
  instrument_type: string;
  current_price?: number;
  asset_class_allocation?: Record<string, number>;
  region_allocation?: Record<string, number>;
  sector_allocation?: Record<string, number>;
}

// ✅ remove "any": instrument vindo embedado no Position pode ser Instrument
interface Position {
  position_id: string;
  account_id: string;
  symbol: string;
  quantity: number;
  instrument?: Instrument;
  created_at: string;
  updated_at: string;
}

// ✅ remove "any": tipo do retorno da API /api/accounts
type AccountsApiResponse = Account[] | { accounts: Account[] };

const CHART_COLORS = ["#209DD7", "#753991", "#FFB707", "#062147", "#10B981"];

// ✅ Safe formatter for Recharts Tooltip (handles number | string | undefined)
const currencyFormatter = (value?: number | string) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return `$${n.toLocaleString("en-US")}`;
};

const percentFormatter = (value?: number | string) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n}%`;
};

function normalizeAccountsResponse(data: AccountsApiResponse): Account[] {
  if (Array.isArray(data)) return data;
  return Array.isArray(data.accounts) ? data.accounts : [];
}

export default function Dashboard() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();

  const [userData, setUserData] = useState<UserData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [positions, setPositions] = useState<Record<string, Position[]>>({});
  const [instruments, setInstruments] = useState<Record<string, Instrument>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalysisDate, setLastAnalysisDate] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [yearsUntilRetirement, setYearsUntilRetirement] = useState(0);
  const [targetRetirementIncome, setTargetRetirementIncome] = useState(0);
  const [equityTarget, setEquityTarget] = useState(0);
  const [fixedIncomeTarget, setFixedIncomeTarget] = useState(0);
  const [northAmericaTarget, setNorthAmericaTarget] = useState(0);
  const [internationalTarget, setInternationalTarget] = useState(0);

  const calculatePortfolioSummary = useCallback(() => {
    let totalValue = 0;

    const assetClassBreakdown: Record<string, number> = {
      equity: 0,
      fixed_income: 0,
      alternatives: 0,
      cash: 0,
    };

    // cash
    for (const account of accounts) {
      const cashBalance = Number(account.cash_balance || 0);
      totalValue += cashBalance;
      assetClassBreakdown.cash += cashBalance;
    }

    // positions
    for (const accountPositions of Object.values(positions)) {
      for (const position of accountPositions) {
        const instrument = instruments[position.symbol];
        if (instrument?.current_price) {
          const positionValue =
            Number(position.quantity || 0) * Number(instrument.current_price || 0);
          totalValue += positionValue;

          if (instrument.asset_class_allocation) {
            for (const [assetClass, percentage] of Object.entries(
              instrument.asset_class_allocation
            )) {
              assetClassBreakdown[assetClass] =
                (assetClassBreakdown[assetClass] || 0) +
                (positionValue * Number(percentage)) / 100;
            }
          }
        }
      }
    }

    return { totalValue, assetClassBreakdown };
  }, [accounts, positions, instruments]);

  useEffect(() => {
    async function loadData() {
      if (!userLoaded || !user) return;

      try {
        const token = await getToken();
        if (!token) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        // sync/get user
        const userResponse = await fetch(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!userResponse.ok) {
          throw new Error(`Failed to sync user: ${userResponse.status}`);
        }

        const userJson: unknown = await userResponse.json();
        const u = (userJson && typeof userJson === "object" && "user" in userJson)
          ? (userJson as { user: UserData }).user
          : (userJson as UserData);

        // Apply locally-saved settings (demo/dev fallback) if present
        let mergedUser = u;
        try {
          const local = localStorage.getItem("ALEX_USER_SETTINGS");
          if (local) {
            const parsed = JSON.parse(local);
            mergedUser = { ...u, ...parsed };
          }
        } catch (e) {
          // ignore localStorage/JSON errors
          console.warn("Could not read local settings:", e);
        }

        setUserData(mergedUser);
        setDisplayName(mergedUser.display_name || "");

        setYearsUntilRetirement(mergedUser.years_until_retirement || 0);

        const incomeRaw = mergedUser.target_retirement_income ?? 0;
        const income =
          typeof incomeRaw === "string" ? parseFloat(incomeRaw) : Number(incomeRaw);
        setTargetRetirementIncome(Number.isFinite(income) ? income : 0);

        setEquityTarget(mergedUser.asset_class_targets?.equity || 0);
        setFixedIncomeTarget(mergedUser.asset_class_targets?.fixed_income || 0);
        setNorthAmericaTarget(u.region_targets?.north_america || 0);
        setInternationalTarget(u.region_targets?.international || 0);

        // accounts
        const accountsResponse = await fetch(`${API_URL}/api/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (accountsResponse.ok) {
          const accountsJson = (await accountsResponse.json()) as AccountsApiResponse;
          const accountsList = normalizeAccountsResponse(accountsJson);
          setAccounts(accountsList);

          const positionsMap: Record<string, Position[]> = {};
          const instrumentsMap: Record<string, Instrument> = {};

          for (const account of accountsList) {
            const accountId = account.account_id;
            if (!accountId) continue;

            const positionsResponse = await fetch(
              `${API_URL}/api/accounts/${accountId}/positions`,
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (positionsResponse.ok) {
              const positionsJson = (await positionsResponse.json()) as {
                positions?: Position[];
              };

              const list = positionsJson.positions ?? [];
              positionsMap[accountId] = list;

              for (const position of list) {
                if (position.instrument) {
                  instrumentsMap[position.symbol] = position.instrument;
                }
              }
            }
          }

          setPositions(positionsMap);
          setInstruments(instrumentsMap);
        }

        setLastAnalysisDate(null);
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userLoaded, user, getToken]);

  useEffect(() => {
    if (!userLoaded || !user) return;

    const handleAnalysisCompleted = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const accountsResponse = await fetch(`${API_URL}/api/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (accountsResponse.ok) {
          const accountsJson = (await accountsResponse.json()) as AccountsApiResponse;
          const accountsList = normalizeAccountsResponse(accountsJson);
          setAccounts(accountsList);

          const positionsData: Record<string, Position[]> = {};
          const instrumentsData: Record<string, Instrument> = {};

          for (const account of accountsList) {
            const accountId = account.account_id;
            if (!accountId) continue;

            const positionsResponse = await fetch(
              `${API_URL}/api/accounts/${accountId}/positions`,
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (positionsResponse.ok) {
              const data = (await positionsResponse.json()) as { positions?: Position[] };
              const list = data.positions ?? [];
              positionsData[accountId] = list;

              for (const position of list) {
                if (position.instrument) {
                  instrumentsData[position.symbol] = position.instrument;
                }
              }
            }
          }

          setPositions(positionsData);
          setInstruments(instrumentsData);
        }
      } catch (err) {
        console.error("Error refreshing dashboard data:", err);
      }
    };

    window.addEventListener("analysis:completed", handleAnalysisCompleted);
    return () =>
      window.removeEventListener("analysis:completed", handleAnalysisCompleted);
  }, [userLoaded, user, getToken]);

  const handleSaveSettings = async () => {
    if (!userData) return;

    if (!displayName || displayName.trim().length === 0) {
      showToast("error", "Display name is required");
      return;
    }
    if (yearsUntilRetirement < 0 || yearsUntilRetirement > 50) {
      showToast("error", "Years until retirement must be between 0 and 50");
      return;
    }
    if (targetRetirementIncome < 0) {
      showToast("error", "Target retirement income must be positive");
      return;
    }

    const equityFixed = equityTarget + fixedIncomeTarget;
    if (Math.abs(equityFixed - 100) > 0.01) {
      showToast("error", "Equity and Fixed Income must sum to 100%");
      return;
    }

    const regionTotal = northAmericaTarget + internationalTarget;
    if (Math.abs(regionTotal - 100) > 0.01) {
      showToast("error", "North America and International must sum to 100%");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const updateData = {
        display_name: displayName.trim(),
        years_until_retirement: yearsUntilRetirement,
        target_retirement_income: targetRetirementIncome,
        asset_class_targets: {
          equity: equityTarget,
          fixed_income: fixedIncomeTarget,
        },
        region_targets: {
          north_america: northAmericaTarget,
          international: internationalTarget,
        },
      };

      const response = await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        // Backend currently only allows GET on /api/user (Allow: GET). Use local fallback for demo/dev.
        if (response.status === 405) {
          try {
            localStorage.setItem("ALEX_USER_SETTINGS", JSON.stringify(updateData));
          } catch (e) {
            console.warn("Could not persist settings locally:", e);
          }

          setUserData((prev) => (prev ? ({ ...prev, ...updateData } as UserData) : prev));
          showToast("success", "Settings saved locally (demo mode).");
          return;
        }

        throw new Error(`Failed to save settings: ${response.status}`);
      }

      const updated: unknown = await response.json();
      const u = (updated && typeof updated === "object" && "user" in updated)
        ? (updated as { user: UserData }).user
        : (updated as UserData);

      setUserData(u);
      showToast("success", "Settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      showToast("error", err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const { totalValue, assetClassBreakdown } = calculatePortfolioSummary();

  const pieChartData = Object.entries(assetClassBreakdown)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1).replace("_", " "),
      value: Math.round(value),
      percentage: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
    }));

  return (
    <>
      <Head>
        <title>Dashboard - Alex AI Financial Advisor</title>
      </Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-dark mb-8">Dashboard</h1>

          {loading ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg shadow p-6">
                    <Skeleton className="h-4 w-3/4 mx-auto mb-3" />
                    <Skeleton className="h-8 w-1/2 mx-auto" />
                  </div>
                ))}
              </div>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">
                    Total Portfolio Value
                  </h3>
                  <p className="text-3xl font-bold text-primary">
                    {currencyFormatter(totalValue)}
                  </p>
                </div>

                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">
                    Number of Accounts
                  </h3>
                  <p className="text-3xl font-bold text-dark">{accounts.length}</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2 text-center">
                    Asset Allocation
                  </h3>
                  {pieChartData.length > 0 ? (
                    <div className="h-24">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={20}
                            outerRadius={40}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {pieChartData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={currencyFormatter} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No positions yet</p>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">Last Analysis</h3>
                  <p className="text-3xl font-bold text-dark">
                    {lastAnalysisDate ? new Date(lastAnalysisDate).toLocaleDateString() : "Never"}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6 mb-8">
                <h2 className="text-xl font-semibold text-dark mb-6">User Settings</h2>

                {error ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-red-600">{error}</p>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Target Retirement Income (Annual)
                    </label>
                    <input
                      type="text"
                      value={
                        targetRetirementIncome
                          ? targetRetirementIncome.toLocaleString("en-US")
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, "");
                        const num = parseInt(raw, 10) || 0;
                        setTargetRetirementIncome(Number.isFinite(num) ? num : 0);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Years Until Retirement: {yearsUntilRetirement}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={yearsUntilRetirement}
                      onChange={(e) => setYearsUntilRetirement(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>0</span>
                      <span>10</span>
                      <span>20</span>
                      <span>30</span>
                      <span>40</span>
                      <span>50</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Target Asset Class Allocation
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-600">Equity: {equityTarget}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={equityTarget}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEquityTarget(val);
                            setFixedIncomeTarget(100 - val);
                          }}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">
                          Fixed Income: {fixedIncomeTarget}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={fixedIncomeTarget}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFixedIncomeTarget(val);
                            setEquityTarget(100 - val);
                          }}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="mt-4 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Equity", value: equityTarget },
                              { name: "Fixed Income", value: fixedIncomeTarget },
                            ]}
                            cx="50%"
                            cy="50%"
                            outerRadius={40}
                            dataKey="value"
                          >
                            <Cell fill="#209DD7" />
                            <Cell fill="#753991" />
                          </Pie>
                          <Tooltip formatter={percentFormatter} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Target Regional Allocation
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-600">
                          North America: {northAmericaTarget}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={northAmericaTarget}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setNorthAmericaTarget(val);
                            setInternationalTarget(100 - val);
                          }}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">
                          International: {internationalTarget}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={internationalTarget}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setInternationalTarget(val);
                            setNorthAmericaTarget(100 - val);
                          }}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="mt-4 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "North America", value: northAmericaTarget },
                              { name: "International", value: internationalTarget },
                            ]}
                            cx="50%"
                            cy="50%"
                            outerRadius={40}
                            dataKey="value"
                          >
                            <Cell fill="#FFB707" />
                            <Cell fill="#062147" />
                          </Pie>
                          <Tooltip formatter={percentFormatter} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving || loading}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      saving || loading
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-primary text-white hover:bg-blue-600"
                    }`}
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Layout>
    </>
  );
}
