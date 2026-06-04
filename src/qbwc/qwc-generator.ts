import { env } from "../config/env";
import { QB_TYPE_VALUES, type QBType } from "../config/env";

export interface QWCConfig {
  appName: string;
  appURL: string;
  appSupport: string;
  appDescription?: string;
  appID?: string;
  appDisplayName?: string;
  appUniqueName?: string;
  username: string;
  ownerID: string;
  fileID: string;
  qbType: QBType;
  authFlags?: string;
  certURL?: string;
  notify?: boolean;
  unattendedModePref?: "umpRequired" | "umpOptional";
  personalDataPref?: "pdpNotNeeded" | "pdpOptional" | "pdpRequired";
  scheduler?: {
    runEveryNMinutes?: number;
    runEveryNSeconds?: number;
  };
}

/**
 * QBWC only accepts the literal values "QBFS" or "QBPOS" in <QBType>.
 * Country codes (US, CA, UK) belong in the qbXMLCountry parameter that
 * QBWC sends to us in sendRequestXML — never in the QWC. If a connection
 * row somehow has a non-standard value (legacy data, direct SQL edit),
 * coerce it to a safe default rather than emit a QWC that bricks the
 * Web Connector with QBWC1065.
 */
function normalizeQBType(value: string | undefined | null): QBType {
  if (value && (QB_TYPE_VALUES as readonly string[]).includes(value)) {
    return value as QBType;
  }
  return "QBFS";
}

/**
 * Generate the .qwc (QuickBooks Web Connector configuration) file.
 *
 * Design note: <IsReadOnly> is intentionally hard-coded to "false" here.
 * Intuit's QBWC requires write permission during the *first* registration
 * of an app in order to store our FileID as a Company data extension. If
 * <IsReadOnly>true</true> is set, that bootstrap step fails with QBWC1080
 * and the app can't be added at all. Once the FileID is stored, the QWC's
 * IsReadOnly flag is purely cosmetic — it just hides write options in the
 * QBWC UI. Real read-only enforcement happens server-side in
 * enqueueJob() and sendRequestXML(), which silently drop outbound write
 * jobs when connection.is_read_only or env.READ_ONLY is set. So we always
 * advertise "we may write" to QBWC, but in practice we only do so when
 * read-only mode is off. See audit doc for the read-only walk-through.
 */
function schedulerBlock(s: QWCConfig["scheduler"]): string {
  if (!s) return "";
  if (s.runEveryNSeconds !== undefined) {
    return `  <Scheduler>
    <RunEveryNSeconds>${s.runEveryNSeconds}</RunEveryNSeconds>
  </Scheduler>`;
  }
  if (s.runEveryNMinutes !== undefined) {
    return `  <Scheduler>
    <RunEveryNMinutes>${s.runEveryNMinutes}</RunEveryNMinutes>
  </Scheduler>`;
  }
  return "";
}

function optionalField(name: string, value: string | undefined): string {
  return value !== undefined && value !== "" ? `  <${name}>${escapeXml(value)}</${name}>\n` : "";
}

export function generateQWC(config: QWCConfig): string {
  const appID = config.appID ?? config.appName.replace(/\s+/g, "");
  const appSupport = config.appSupport ?? config.appURL;
  const authFlags = config.authFlags ?? env.QWC_AUTH_FLAGS;
  const qbType = normalizeQBType(config.qbType);

  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${escapeXml(config.appName)}</AppName>
${optionalField("AppDisplayName", config.appDisplayName)}
${optionalField("AppUniqueName", config.appUniqueName)}
  <AppID>${escapeXml(appID)}</AppID>
  <AppURL>${escapeXml(config.appURL)}</AppURL>
  <AppDescription>${escapeXml(config.appDescription ?? "QBWC to n8n Bridge")}</AppDescription>
  <AppSupport>${escapeXml(appSupport)}</AppSupport>
${optionalField("CertURL", config.certURL)}
  <UserName>${escapeXml(config.username)}</UserName>
  <OwnerID>{${config.ownerID}}</OwnerID>
  <FileID>{${config.fileID}}</FileID>
  <QBType>${qbType}</QBType>
  <Style>Document</Style>
  <AuthFlags>${escapeXml(authFlags)}</AuthFlags>
${optionalField("UnattendedModePref", config.unattendedModePref)}
${optionalField("PersonalDataPref", config.personalDataPref)}
  <IsReadOnly>false</IsReadOnly>
  <Notify>${config.notify ? "true" : "false"}</Notify>
${schedulerBlock(config.scheduler)}
</QBWCXML>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
