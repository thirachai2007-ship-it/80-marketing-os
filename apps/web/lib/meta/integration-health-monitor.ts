import { getActiveMetaConnection, getActiveMetaPagesWithTokens } from "@/lib/meta/connection-token";
import { getMetaPermissions, getMetaUserProfile } from "@/lib/meta/oauth-client";
import prisma from "@/lib/prisma";

export const META_INTEGRATION_HEALTH_VERSION = "meta-integration-health-v1";
export const TOKEN_WARNING_DAYS = 14;
export const REQUIRED_META_SCOPES = ["public_profile", "pages_show_list", "pages_read_engagement", "ads_read", "ads_management", "business_management"];

export async function runMetaIntegrationHealthMonitor() {
  const checkedAt = new Date();
  const connection = await prisma.metaConnection.findFirst({ where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, select: { id: true, tokenExpiresAt: true, lastErrorCode: true, lastErrorMessage: true } });
  const alerts: Array<{ severity: "WARNING" | "CRITICAL"; code: string; message: string }> = [];
  let grantedScopes: string[] = [];
  let liveTokenValid = false;
  let pageAccessCount = 0;
  if (!connection) alerts.push({ severity: "CRITICAL", code: "META_NOT_CONNECTED", message: "Meta is not connected; automatic Sync cannot run." });
  else {
    const daysUntilExpiry = connection.tokenExpiresAt ? Math.floor((connection.tokenExpiresAt.getTime() - checkedAt.getTime()) / 86_400_000) : null;
    if (daysUntilExpiry === null) alerts.push({ severity: "WARNING", code: "TOKEN_EXPIRY_UNKNOWN", message: "Meta token expiry is unknown; reconnect before Sync is interrupted." });
    else if (daysUntilExpiry < 0) alerts.push({ severity: "CRITICAL", code: "TOKEN_EXPIRED", message: "Meta token has expired; reconnect now." });
    else if (daysUntilExpiry <= TOKEN_WARNING_DAYS) alerts.push({ severity: "WARNING", code: "TOKEN_EXPIRING_SOON", message: `Meta token expires in ${daysUntilExpiry} day(s); reconnect in advance.` });
    try {
      const active = await getActiveMetaConnection();
      const [profile, permissions, pages] = await Promise.all([getMetaUserProfile(active.accessToken), getMetaPermissions(active.accessToken), getActiveMetaPagesWithTokens(active.id)]);
      liveTokenValid = Boolean(profile.id);
      grantedScopes = permissions.filter((item) => item.status === "granted").map((item) => item.permission);
      const missing = REQUIRED_META_SCOPES.filter((scope) => !grantedScopes.includes(scope));
      if (missing.length > 0) alerts.push({ severity: "CRITICAL", code: "META_PERMISSIONS_MISSING", message: `Required Meta permissions missing: ${missing.join(", ")}` });
      pageAccessCount = pages.length;
      if (pages.length === 0) alerts.push({ severity: "CRITICAL", code: "PAGE_ACCESS_MISSING", message: "No active Page access token is available for Sync." });
    } catch (error) {
      alerts.push({ severity: "CRITICAL", code: "LIVE_TOKEN_VALIDATION_FAILED", message: error instanceof Error ? error.message : "Live Meta token validation failed." });
    }
    const activeAdAccounts = await prisma.adAccount.count({ where: { metaConnectionId: connection.id, isActive: true } });
    if (activeAdAccounts === 0) alerts.push({ severity: "CRITICAL", code: "AD_ACCOUNT_ACCESS_MISSING", message: "No active Ad Account is available for tracking." });
    const failedSyncs = await prisma.metaSyncRun.count({ where: { metaConnectionId: connection.id, status: "FAILED", createdAt: { gte: new Date(checkedAt.getTime() - 24 * 60 * 60 * 1000) } } });
    if (failedSyncs > 0) alerts.push({ severity: "CRITICAL", code: "RECENT_SYNC_FAILURES", message: `${failedSyncs} Meta Sync operation(s) failed in the last 24 hours.` });
    if (connection.lastErrorCode) alerts.push({ severity: "CRITICAL", code: "META_CONNECTION_ERROR", message: `${connection.lastErrorCode}: ${connection.lastErrorMessage ?? "Meta connection error"}` });
  }
  const status = alerts.some((item) => item.severity === "CRITICAL") ? "UNHEALTHY" : alerts.length > 0 ? "WARNING" : "HEALTHY";
  const signature = alerts.map((item) => item.code).sort().join(",") || "HEALTHY";
  const latest = await prisma.decisionLog.findFirst({ where: { decisionType: "META_INTEGRATION_HEALTH_ALERT" }, orderBy: { createdAt: "desc" }, select: { outputJson: true } });
  let latestSignature: string | null = null;
  try { latestSignature = latest?.outputJson ? String((JSON.parse(latest.outputJson) as { signature?: unknown }).signature ?? "") : null; } catch {}
  if (latestSignature !== signature) await prisma.decisionLog.create({ data: { decisionType: "META_INTEGRATION_HEALTH_ALERT", action: status === "HEALTHY" ? "META_INTEGRATION_RECOVERED" : "NOTIFY_OWNER_META_INTEGRATION_RISK", reason: alerts.map((item) => item.message).join(" | ") || "Meta Integration is healthy.", confidence: 100, inputJson: JSON.stringify({ checkedAt: checkedAt.toISOString(), warningDays: TOKEN_WARNING_DAYS }), outputJson: JSON.stringify({ signature, status, alerts }), policyJson: JSON.stringify({ preventSilentSyncFailure: true, automaticMonitoring: true }), policyReference: META_INTEGRATION_HEALTH_VERSION } });
  await prisma.metaConnection.updateMany({ where: { id: connection?.id }, data: { lastValidatedAt: checkedAt } });
  return { monitorVersion: META_INTEGRATION_HEALTH_VERSION, checkedAt: checkedAt.toISOString(), status, pass: status !== "UNHEALTHY", liveTokenValid, pageAccessCount, grantedScopes, warningDays: TOKEN_WARNING_DAYS, alertCount: alerts.length, alerts, automatic: true, userVisibleAlerts: true };
}
