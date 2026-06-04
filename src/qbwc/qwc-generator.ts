import { env } from "../config/env";
import type { QBType } from "../config/env";

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
  isReadOnly: boolean;
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
  <QBType>${config.qbType}</QBType>
  <Style>Document</Style>
  <AuthFlags>${escapeXml(authFlags)}</AuthFlags>
${optionalField("UnattendedModePref", config.unattendedModePref)}
${optionalField("PersonalDataPref", config.personalDataPref)}
  <IsReadOnly>${config.isReadOnly ? "true" : "false"}</IsReadOnly>
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
