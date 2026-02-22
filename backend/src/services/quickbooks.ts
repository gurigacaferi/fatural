/**
 * QuickBooks Online integration service.
 * OAuth 2.0 flow + expense sync.
 */
import { query } from "../config/database.js";

const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID || "";
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET || "";
const QB_REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI || "";
const QB_AUTH_URL = "https://app.intuit.com/app/oauth2/v1/authorize";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_ENV = process.env.QUICKBOOKS_ENVIRONMENT || "sandbox";
const QB_API_BASE =
  QB_ENV === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company";

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: QB_CLIENT_ID,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting openid profile email",
    redirect_uri: QB_REDIRECT_URI,
    state,
  });
  return `${QB_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string) {
  const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: QB_REDIRECT_URI,
  });

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`QB token exchange failed: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error("Failed to refresh QB token");

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Ensure valid token (auto-refresh if expired)
// ---------------------------------------------------------------------------

export async function getValidToken(userId: string) {
  const { rows } = await query(
    `SELECT * FROM quickbooks_integrations WHERE user_id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;

  const integration = rows[0];

  if (new Date(integration.expires_at) < new Date()) {
    const refreshed = await refreshAccessToken(integration.refresh_token);
    await query(
      `UPDATE quickbooks_integrations
         SET access_token = $1, refresh_token = $2, expires_at = $3
       WHERE id = $4`,
      [refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt, integration.id]
    );
    return { ...integration, access_token: refreshed.accessToken };
  }

  return integration;
}

// ---------------------------------------------------------------------------
// Find or create vendor, then create expense in QB
// ---------------------------------------------------------------------------

async function findOrCreateVendor(
  name: string,
  accessToken: string,
  realmId: string
): Promise<{ value: string } | null> {
  if (!name) return null;

  const escaped = name.replace(/'/g, "\\'");
  const searchUrl = `${QB_API_BASE}/${realmId}/query?query=${encodeURIComponent(
    `SELECT Id FROM Vendor WHERE DisplayName = '${escaped}'`
  )}&minorversion=69`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const searchData = await searchRes.json();
  if (searchData?.QueryResponse?.Vendor?.length > 0) {
    return { value: searchData.QueryResponse.Vendor[0].Id };
  }

  // Create
  const createRes = await fetch(`${QB_API_BASE}/${realmId}/vendor?minorversion=69`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ DisplayName: name }),
  });
  const createData = await createRes.json();
  if (createRes.ok && createData?.Vendor?.Id) {
    return { value: createData.Vendor.Id };
  }
  return null;
}

export async function sendExpensesToQuickBooks(
  userId: string,
  expenses: { id: string; name: string; amount: number; date: string; merchant: string | null }[]
) {
  const integration = await getValidToken(userId);
  if (!integration) throw new Error("QuickBooks integration not found");

  const results: { expenseId: string; status: string; error?: any }[] = [];
  const accessToken = integration.access_token;
  const realmId = integration.realm_id;

  for (const exp of expenses) {
    try {
      const vendorRef = await findOrCreateVendor(exp.merchant || "", accessToken, realmId);
      const payload = {
        AccountRef: { value: "35" },
        PaymentType: "Cash",
        TxnDate: exp.date,
        Line: [
          {
            Amount: exp.amount,
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: { AccountRef: { value: "81" } },
            Description: exp.name,
          },
        ],
        ...(vendorRef && { EntityRef: vendorRef }),
      };

      const res = await fetch(`${QB_API_BASE}/${realmId}/expense?minorversion=69`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        results.push({ expenseId: exp.id, status: "success" });
      } else {
        results.push({ expenseId: exp.id, status: "failed", error: await res.json() });
      }
    } catch (e: any) {
      results.push({ expenseId: exp.id, status: "failed", error: e.message });
    }
  }

  return results;
}
