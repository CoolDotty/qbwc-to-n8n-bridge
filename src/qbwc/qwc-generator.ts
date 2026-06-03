import { env } from "../config/env";

export interface QWCConfig {
  appName: string;
  appURL: string;
  appSupport: string;
  appDescription?: string;
  username: string;
  ownerID: string;
  fileID: string;
  qbType: string;
  isReadOnly: boolean;
  scheduler?: {
    runEveryNMinutes: number;
  };
}

export function generateQWC(config: QWCConfig): string {
  const schedulerBlock = config.scheduler
    ? `  <Scheduler>
    <RunEveryNMinutes>${config.scheduler.runEveryNMinutes}</RunEveryNMinutes>
  </Scheduler>`
    : "";

  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${escapeXml(config.appName)}</AppName>
  <AppURL>${escapeXml(config.appURL)}</AppURL>
  <AppDescription>${escapeXml(config.appDescription ?? "QBWC to n8n Bridge")}</AppDescription>
  <AppSupport>${escapeXml(config.appSupport)}</AppSupport>
  <UserName>${escapeXml(config.username)}</UserName>
  <OwnerID>{${config.ownerID}}</OwnerID>
  <FileID>{${config.fileID}}</FileID>
  <QBType>${config.qbType}</QBType>
${schedulerBlock}
  <IsReadOnly>${config.isReadOnly ? "true" : "false"}</IsReadOnly>
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
