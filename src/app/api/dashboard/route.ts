import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RebootApiError, runGraphQL } from "@/lib/reboot-api";

const COOKIE_NAME = "reboot_token";

type UserRow = {
  id: number;
  login: string;
  attrs?: {
    firstName?: string;
    lastName?: string;
    country?: string;
  };
  auditRatio?: number;
  totalUp?: number;
  totalDown?: number;
};

type TransactionRow = {
  type?: string;
  amount: number;
  path?: string;
  createdAt: string;
};

type UserResponse = { user: UserRow[] };

type DashboardResponse = {
  xp_total: {
    aggregate?: {
      sum?: {
        amount?: number | null;
      } | null;
    } | null;
  };
  xp_history: TransactionRow[];
  Done: {
    aggregate?: {
      sum?: {
        amount?: number | null;
      } | null;
    } | null;
  };
  Receive: {
    aggregate?: {
      sum?: {
        amount?: number | null;
      } | null;
    } | null;
  };
  passed?: {
    aggregate?: {
      count?: number | null;
    } | null;
  } | null;
  failed?: {
    aggregate?: {
      count?: number | null;
    } | null;
  } | null;
  inProgress?: {
    aggregate?: {
      count?: number | null;
    } | null;
  } | null;
  skills: Array<{ type: string; amount: number }>;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function bytesToKb(bytes: number): number {
  return round2(bytes / 1000);
}

function normalizeSkillName(type: string): string {
  return type.replace(/^skill_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toSkillPercent(amount: number): number {
  if (amount <= 1) {
    return round2(amount * 100);
  }
  return round2(amount);
}

function extractTransactionLabel(path?: string): string {
  if (!path) {
    return "unknown";
  }

  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

function buildSummary(
  user: UserRow,
  payload: DashboardResponse,
) {
  const xpHistoryTransactions = (payload.xp_history ?? []).filter((item) => item.amount > 0);
  const totalXp = payload.xp_total?.aggregate?.sum?.amount ?? 0;
  const totalUp = payload.Done?.aggregate?.sum?.amount ?? user.totalUp ?? 0;
  const totalDown = payload.Receive?.aggregate?.sum?.amount ?? user.totalDown ?? 0;

  const computedRatio = totalDown > 0 ? totalUp / totalDown : 0;
  const auditRatio = user.auditRatio ?? computedRatio;

  const recentXp = [...xpHistoryTransactions]
    .slice(0, 8)
    .map((item) => ({
      path: extractTransactionLabel(item.path),
      amountKb: bytesToKb(item.amount),
      createdAt: item.createdAt,
    }));

  const skillScoreByType = new Map<string, number>();

  for (const row of payload.skills ?? []) {
    if (!row.type?.startsWith("skill_")) {
      continue;
    }

    const score = toSkillPercent(row.amount ?? 0);
    const current = skillScoreByType.get(row.type) ?? 0;
    if (score > current) {
      skillScoreByType.set(row.type, score);
    }
  }

  const preferredSkills: Array<{ key: string; name: string }> = [
    { key: "go", name: "Go" },
    { key: "prog", name: "Prog" },
    { key: "back", name: "Back-End" },
    { key: "front", name: "Front-End" },
    { key: "js", name: "Js" },
    { key: "html", name: "Html" },
  ];

  const skillEntries = [...skillScoreByType.entries()];
  const usedTypes = new Set<string>();

  const topSkills = preferredSkills.map((skill) => {
    const matches = skillEntries
      .filter(([type]) => type.toLowerCase().includes(skill.key))
      .sort((a, b) => b[1] - a[1]);
    const selected = matches[0];
    if (!selected) {
      return { name: skill.name, value: 0 };
    }
    usedTypes.add(selected[0]);
    return { name: skill.name, value: selected[1] };
  });

  const fallbackSkills = skillEntries
    .filter(([type]) => !usedTypes.has(type))
    .map(([type, value]) => ({
      name: normalizeSkillName(type),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  for (let i = 0; i < topSkills.length; i += 1) {
    if (topSkills[i].value > 0) {
      continue;
    }
    const replacement = fallbackSkills.shift();
    if (!replacement) {
      break;
    }
    topSkills[i] = replacement;
  }

  const cumulativeXp = [] as Array<{ date: string; totalKb: number; gainedKb: number }>;
  let runningTotal = 0;

  for (const item of [...xpHistoryTransactions].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))) {
    runningTotal += item.amount;
    cumulativeXp.push({
      date: item.createdAt,
      totalKb: bytesToKb(runningTotal),
      gainedKb: bytesToKb(item.amount),
    });
  }

  const projectMap = new Map<string, number>();

  for (const item of xpHistoryTransactions) {
    const name = extractTransactionLabel(item.path);
    projectMap.set(name, (projectMap.get(name) ?? 0) + item.amount);
  }

  const xpByProject = [...projectMap.entries()]
    .map(([name, amount]) => ({ name, amountKb: bytesToKb(amount) }))
    .sort((a, b) => b.amountKb - a.amountKb)
    .slice(0, 12);

  const passes = payload.passed?.aggregate?.count ?? 0;
  const fails = payload.failed?.aggregate?.count ?? 0;

  return {
    user: {
      id: user.id,
      login: user.login,
      firstName: user.attrs?.firstName ?? "",
      lastName: user.attrs?.lastName ?? "",
      country: user.attrs?.country ?? "",
    },
    totals: {
      xpKb: bytesToKb(totalXp),
      xpBytes: totalXp,
      transactionCount: xpHistoryTransactions.length,
      auditRatio: round2(auditRatio),
      totalUpKb: bytesToKb(totalUp),
      totalDownKb: bytesToKb(totalDown),
    },
    recentXp,
    topSkills,
    cumulativeXp,
    xpByProject,
    performance: {
      pass: passes,
      fail: fails,
    },
    latestProgress: [],
  };
}

const USER_QUERY = `
  query UserQuery {
    user {
      id
      login
      attrs
      auditRatio
      totalUp
      totalDown
    }
  }
`;

const DASHBOARD_QUERY = `
  query DashboardQuery($userId: Int!) {
    xp_total: transaction_aggregate(
      where: {
        userId: { _eq: $userId }
        type: { _eq: "xp" }
        path: { _like: "%/bh-module/%" }
        _or: [
          { path: { _nlike: "%/piscine%" } }
          { path: { _eq: "/bahrain/bh-module/piscine-js" } }
          { path: { _eq: "/bahrain/bh-module/piscine-rust" } }
        ]
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
    xp_history: transaction(
      where: {
        userId: { _eq: $userId }
        type: { _eq: "xp" }
        path: { _like: "%/bh-module/%" }
        _or: [
          { path: { _nlike: "%/piscine%" } }
          { path: { _eq: "/bahrain/bh-module/piscine-js" } }
          { path: { _eq: "/bahrain/bh-module/piscine-rust" } }
        ]
      }
      order_by: { createdAt: asc }
    ) {
      amount
      path
      createdAt
    }
    Done: transaction_aggregate(
      where: {
        userId: { _eq: $userId }
        type: { _eq: "up" }
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
    Receive: transaction_aggregate(
      where: {
        userId: { _eq: $userId }
        type: { _eq: "down" }
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
    passed: progress_aggregate(
      where: {
        userId: { _eq: $userId }
        object: { type: { _eq: "project" } }
        grade: { _gte: 1 }
      }
    ) {
      aggregate {
        count
      }
    }
    failed: progress_aggregate(
      where: {
        userId: { _eq: $userId }
        object: { type: { _eq: "project" } }
        grade: { _lt: 1 }
      }
    ) {
      aggregate {
        count
      }
    }
    inProgress: progress_aggregate(
      where: {
        userId: { _eq: $userId }
        object: { type: { _eq: "project" } }
        grade: { _is_null: true }
      }
    ) {
      aggregate {
        count
      }
    }
    skills: transaction(
      where: {
        userId: { _eq: $userId }
        type: { _like: "skill_%" }
      }
    ) {
      type
      amount
    }
  }
`;

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userPayload = await runGraphQL<UserResponse>(token, USER_QUERY);
    const user = userPayload.user?.[0];

    if (!user) {
      return NextResponse.json({ message: "Unable to load user profile." }, { status: 404 });
    }

    const dashboardPayload = await runGraphQL<DashboardResponse>(token, DASHBOARD_QUERY, {
      userId: user.id,
    });

    const summary = buildSummary(user, dashboardPayload);

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof RebootApiError) {
      if (error.status === 401) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json({ message: "Failed to load dashboard." }, { status: 500 });
  }
}
