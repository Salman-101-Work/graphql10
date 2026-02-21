const API_SIGNIN_ENDPOINT =
  process.env.REBOOT_SIGNIN_ENDPOINT ??
  "https://learn.reboot01.com/api/auth/signin";

const API_GRAPHQL_ENDPOINT =
  process.env.REBOOT_GRAPHQL_ENDPOINT ??
  "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

export class RebootApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
    this.name = "RebootApiError";
  }
}

function normalizeJwt(raw: string): string {
  const trimmed = raw.trim();

  // Some providers return JSON strings/objects instead of plain text.
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") {
      return parsed.trim();
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "token" in parsed &&
      typeof (parsed as { token?: unknown }).token === "string"
    ) {
      return (parsed as { token: string }).token.trim();
    }
  } catch {
    // Not JSON, use plain-text token below.
  }

  // Handles quoted string without valid JSON parsing edge cases.
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function isLikelyJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) {
    return false;
  }
  return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part) && part.length > 0);
}

export async function signInWithBasic(
  identifier: string,
  password: string,
): Promise<string> {
  const basicToken = Buffer.from(`${identifier}:${password}`).toString("base64");

  const response = await fetch(API_SIGNIN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new RebootApiError("Invalid credentials.", 401);
    }

    throw new RebootApiError("Unable to sign in to Reboot01.", response.status);
  }

  const token = normalizeJwt(await response.text());

  if (!token || token.length < 20 || !isLikelyJwt(token)) {
    throw new RebootApiError("Invalid token returned by Reboot01.", 502);
  }

  return token;
}

export async function runGraphQL<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(API_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    cache: "no-store",
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new RebootApiError(
      "Unable to query Reboot01 GraphQL endpoint.",
      response.status,
    );
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new RebootApiError(payload.errors[0].message, 400);
  }

  if (!payload.data) {
    throw new RebootApiError("GraphQL query returned no data.", 502);
  }

  return payload.data;
}
