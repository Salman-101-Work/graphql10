"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type DashboardData = {
  user: {
    id: number;
    login: string;
    firstName: string;
    lastName: string;
    country: string;
  };
  totals: {
    xpKb: number;
    xpBytes: number;
    auditRatio: number;
    totalUpKb: number;
    totalDownKb: number;
  };
  recentXp: Array<{
    path: string;
    amountKb: number;
    createdAt: string;
  }>;
  topSkills: Array<{
    name: string;
    value: number;
  }>;
  cumulativeXp: Array<{
    date: string;
    totalKb: number;
    gainedKb: number;
  }>;
  xpByProject: Array<{
    name: string;
    amountKb: number;
  }>;
  performance: {
    pass: number;
    fail: number;
  };
  latestProgress: Array<{
    id: number;
    grade: number | null;
    path?: string;
    createdAt: string;
  }>;
};

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

function cardNumber(value: number, suffix = "") {
  return `${numberFmt.format(value)}${suffix}`;
}

function formatMbFromKb(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0mb";
  }
  return `${formatSig(value / 1_000)}mb`;
}

function formatSig(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 100) {
    return value.toFixed(0);
  }
  if (absValue >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatXp(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0";
  }

  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    return `${formatSig(value / 1_000_000)}mb`;
  }
  if (absValue >= 1_000) {
    return `${formatSig(value / 1_000)}kb`;
  }
  return Math.round(value).toString();
}

function toPath(points: Array<[number, number]>) {
  if (!points.length) {
    return "";
  }

  return points.map((point, idx) => `${idx === 0 ? "M" : "L"}${point[0]} ${point[1]}`).join(" ");
}

function toStepPath(points: Array<[number, number]>) {
  if (!points.length) {
    return "";
  }

  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i];
    path += ` L${x} ${points[i - 1][1]} L${x} ${y}`;
  }
  return path;
}

function LineChart({
  values,
  login,
}: {
  values: Array<{ label: string; value: number; gained: number }>;
  login: string;
}) {
  const width = 900;
  const height = 420;
  const padding = 34;

  if (!values.length) {
    return <p className="empty">No XP data yet.</p>;
  }

  const maxValue = Math.max(...values.map((point) => point.value), 1);
  const minValue = Math.min(...values.map((point) => point.value), 0);
  const span = Math.max(maxValue - minValue, 1);

  const points: Array<[number, number]> = values.map((entry, index) => {
    const x =
      padding +
      (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((entry.value - minValue) / span) * (height - padding * 2);

    return [x, y];
  });

  const path = toStepPath(points);
  const trendPath = toPath(points);
  const start = values[0];
  const latest = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg xp-svg" role="img" aria-label="XP progression over time">
      <rect x="0" y="0" width={width} height={height} fill="transparent" />
      {Array.from({ length: 6 }).map((_, idx) => {
        const y = padding + ((height - padding * 2) * idx) / 5;
        return <line key={y} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#323141" strokeWidth="1" />;
      })}
      <path d={trendPath} fill="none" stroke="#b8b8c7" strokeWidth="1.2" strokeDasharray="2 4" opacity="0.65" />
      <path d={path} fill="none" stroke="#bca0ff" strokeWidth="1.6" />
      <text x={padding} y={height - 44} className="axis-label">{start.label}</text>
      <text x={padding} y={height - 28} className="axis-label">+{formatXp(start.gained)}</text>
      <text x={width - 16} y={padding + 4} className="axis-label right">Total</text>
      <text x={width - 16} y={padding + 18} className="axis-label right">{formatXp(latest.value)}</text>
      <text x={padding} y={70} className="legend-label">{login.toLowerCase()}</text>
      <line x1={padding} y1={65} x2={padding + 32} y2={65} stroke="#bca0ff" strokeWidth="1.6" />
      <text x={padding} y={88} className="legend-label">all students</text>
      <line x1={padding} y1={83} x2={padding + 32} y2={83} stroke="#b8b8c7" strokeWidth="1.2" strokeDasharray="2 4" opacity="0.8" />
    </svg>
  );
}

function arcPath(cx: number, cy: number, radius: number, start: number, end: number) {
  const sx = cx + Math.cos(start) * radius;
  const sy = cy + Math.sin(start) * radius;
  const ex = cx + Math.cos(end) * radius;
  const ey = cy + Math.sin(end) * radius;
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function ProjectDonut({
  values,
  totalXpKb,
}: {
  values: Array<{ label: string; value: number }>;
  totalXpKb: number;
}) {
  const size = 500;
  const center = size / 2;
  const radius = 160;
  const stroke = 34;
  const palette = ["#bfa5ff", "#7cc7ff", "#67e4b8", "#ffd57c", "#ff9a9a", "#9eb4ff", "#dda6ff", "#8de2f6"];

  if (!values.length) {
    return <p className="empty">No project XP data yet.</p>;
  }

  const top = values.slice(0, 8);
  const topTotal = top.reduce((sum, item) => sum + item.value, 0);
  const canonicalTotal = Math.max(totalXpKb, 0);
  const remaining = Math.max(canonicalTotal - topTotal, 0);
  const series = remaining > 0.01 ? [...top, { label: "Other projects", value: remaining }] : top;
  const total = Math.max(canonicalTotal, 1);
  const gap = 0.04;

  const slices = series.reduce(
    (acc, item, idx) => {
      const span = (item.value / total) * Math.PI * 2;
      const start = acc.cursor + gap / 2;
      const end = acc.cursor + span - gap / 2;
      return {
        cursor: acc.cursor + span,
        items: [
          ...acc.items,
          {
            ...item,
            color: palette[idx % palette.length],
            start,
            end,
            ratio: (item.value / total) * 100,
          },
        ],
      };
    },
    { cursor: -Math.PI / 2, items: [] as Array<{ label: string; value: number; color: string; start: number; end: number; ratio: number }> },
  ).items;

  return (
    <div className="project-donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="chart-svg donut-svg" role="img" aria-label="Project XP distribution">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#303142" strokeWidth={stroke} />
        {slices.map((slice) => (
          <path
            key={slice.label}
            d={arcPath(center, center, radius, slice.start, slice.end)}
            fill="none"
            stroke={slice.color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ))}
        <text x={center} y={center - 8} className="donut-total-label" textAnchor="middle">
          Total XP
        </text>
        <text x={center} y={center + 22} className="donut-total-value" textAnchor="middle">
          {formatXp(canonicalTotal)}
        </text>
      </svg>

      <ul className="project-donut-legend">
        {slices.map((slice) => (
          <li key={`legend-${slice.label}`}>
            <span className="legend-color" style={{ backgroundColor: slice.color }} />
            <span className="legend-name">{slice.label}</span>
            <span className="legend-value">{cardNumber(slice.ratio)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RadarChart({
  values,
}: {
  values: Array<{ label: string; value: number }>;
}) {
  const size = 500;
  const center = size / 2;
  const rings = 8;
  const radius = 168;

  if (!values.length) {
    return <p className="empty">No skill transactions yet.</p>;
  }

  const max = Math.max(...values.map((entry) => entry.value), 100);
  const angleStep = (Math.PI * 2) / values.length;

  const polygon = values
    .map((entry, index) => {
      const angle = -Math.PI / 2 + index * angleStep;
      const r = (entry.value / max) * radius;
      const x = center + Math.cos(angle) * r;
      const y = center + Math.sin(angle) * r;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar-svg" role="img" aria-label="Top skills chart">
      {Array.from({ length: rings }).map((_, idx) => {
        const r = ((idx + 1) / rings) * radius;
        return <circle key={r} cx={center} cy={center} r={r} fill="none" stroke="#555266" strokeWidth="1" />;
      })}
      {values.map((entry, index) => {
        const angle = -Math.PI / 2 + index * angleStep;
        const x = center + Math.cos(angle) * (radius + 42);
        const y = center + Math.sin(angle) * (radius + 42);
        return (
          <g key={entry.label}>
            <line x1={center} y1={center} x2={center + Math.cos(angle) * radius} y2={center + Math.sin(angle) * radius} stroke="#555266" strokeWidth="1" />
            <text x={x} y={y} className="axis-label skill-label" textAnchor="middle">
              {entry.label}
            </text>
          </g>
        );
      })}
      <polygon points={polygon} fill="#bea2ffb0" stroke="#bea2ff" strokeWidth="1.5" />
    </svg>
  );
}

export function DashboardApp() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);

  async function fetchDashboardData(): Promise<DashboardData | null> {
    const response = await fetch("/api/dashboard", { cache: "no-store" });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Unable to load dashboard");
    }

    return (await response.json()) as DashboardData;
  }

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const payload = await fetchDashboardData();
        if (!isMounted) {
          return;
        }
        setData(payload);
      } catch (err: unknown) {
        if (!isMounted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthenticating(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Login failed.");
      setAuthenticating(false);
      return;
    }

    setLoading(true);
    setPassword("");
    await fetchDashboardData()
      .then((payload) => {
        setData(payload);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load profile data.");
      })
      .finally(() => setLoading(false));
    setAuthenticating(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setData(null);
    setIdentifier("");
    setPassword("");
  }

  const skillRadarData = useMemo(
    () =>
      (data?.topSkills ?? []).map((entry) => ({
        label: entry.name,
        value: entry.value,
      })),
    [data?.topSkills],
  );

  const lineChartData = useMemo(
    () =>
      (data?.cumulativeXp ?? []).map((entry) => ({
        label: dateFmt.format(new Date(entry.date)),
        value: entry.totalKb,
        gained: entry.gainedKb,
      })),
    [data?.cumulativeXp],
  );

  const projectShareData = useMemo(
    () =>
      (data?.xpByProject ?? []).map((entry) => ({
        label: entry.name,
        value: entry.amountKb,
      })),
    [data?.xpByProject],
  );

  if (loading) {
    return <main className="screen loading-state">Loading Reboot01 data...</main>;
  }

  if (!data) {
    return (
      <main className="screen auth-screen">
        <section className="panel auth-panel">
          <p className="eyebrow">GraphQL Project</p>
          <h1>Reboot01 Profile Dashboard</h1>
          <p className="muted">
            Sign in with `username:password` or `email:password` credentials.
          </p>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Identifier
              <input
                required
                type="text"
                placeholder="username or email"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                placeholder="your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button type="submit" disabled={authenticating}>
              {authenticating ? "Authenticating..." : "Enter Dashboard"}
            </button>
          </form>
          {error ? <p className="error-message">{error}</p> : null}
        </section>
      </main>
    );
  }

  const fullName = `${data.user.firstName} ${data.user.lastName}`.trim();

  return (
    <main className="screen dashboard-screen">
      <header className="topbar panel">
        <div>
          <h1>Welcome, {fullName || data.user.login}!</h1>
        </div>
        <button onClick={logout} className="ghost-button">Logout</button>
      </header>

      <section className="grid-3">
        <article className="panel stat-card">
          <h2>My stats</h2>
          <div className="stat-grid">
            <div>
              <p className="stat-label">Login</p>
              <p className="stat-value">{data.user.login}</p>
            </div>
            <div>
              <p className="stat-label">User ID</p>
              <p className="stat-value">{data.user.id}</p>
            </div>
            <div>
              <p className="stat-label">Total XP</p>
              <p className="stat-value">{formatXp(data.totals.xpKb)}</p>
            </div>
            <div>
              <p className="stat-label">Country</p>
              <p className="stat-value">{data.user.country || "N/A"}</p>
            </div>
          </div>
        </article>

        <article className="panel stat-card">
          <h2>Audit ratio</h2>
          <p className="big-number">{data.totals.auditRatio ? data.totals.auditRatio.toFixed(1) : "0.0"}</p>
          <div className="tiny-grid">
            <div>
              <p className="stat-label">Done</p>
              <p className="stat-value">{formatMbFromKb(data.totals.totalUpKb)}</p>
            </div>
            <div>
              <p className="stat-label">Received</p>
              <p className="stat-value">{formatMbFromKb(data.totals.totalDownKb)}</p>
            </div>
          </div>
        </article>

        <article className="panel stat-card">
          <h2>Performance</h2>
          <div className="tiny-grid">
            <div>
              <p className="stat-label">Pass</p>
              <p className="big-number small">{data.performance.pass}</p>
            </div>
            <div>
              <p className="stat-label">Fail</p>
              <p className="big-number small">{data.performance.fail}</p>
            </div>
          </div>
          <p className="muted tiny">From latest graded results.</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel chart-card">
          <h2>XP Progression</h2>
          <LineChart values={lineChartData} login={data.user.login} />
        </article>
        <article className="panel chart-card">
          <h2>Top skills</h2>
          <h3 className="skills-subtitle">Best skills</h3>
          <RadarChart values={skillRadarData} />
        </article>
      </section>

      <section className="grid-1">
        <article className="panel chart-card modern-card">
          <h2>Project XP Distribution</h2>
          <ProjectDonut values={projectShareData} totalXpKb={data.totals.xpKb} />
        </article>
      </section>
    </main>
  );
}
