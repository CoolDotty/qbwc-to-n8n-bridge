import { parseStringPromise } from "xml2js";

export interface HCPFileID {
  ownerID: string | null;
  fileID: string | null;
}

/**
 * Parse the strHCPResponse payload that QBWC sends on the first sendRequestXML
 * of a session. It contains concatenated HostQuery + CompanyQuery + PreferencesQuery
 * responses. We extract the FileID <DataExtRet> that QuickBooks stores against our
 * OwnerID, so we can warn the user if QBWC is talking to a different .qbw than
 * the one we registered.
 */
export async function parseHCPResponse(xml: string | undefined | null): Promise<HCPFileID> {
  if (!xml || !xml.trim()) return { ownerID: null, fileID: null };

  let parsed: Record<string, unknown>;
  try {
    parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false, mergeAttrs: false });
  } catch {
    return { ownerID: null, fileID: null };
  }

  const root = (parsed as Record<string, unknown>).QBXML ?? parsed;
  const msgs = (root as Record<string, unknown>).QBXMLMsgsRs ?? root;
  const result: HCPFileID = { ownerID: null, fileID: null };

  for (const key of Object.keys(msgs ?? {})) {
    if (!key.endsWith("Rs")) continue;
    const rs = (msgs as Record<string, unknown>)[key];
    if (!rs || typeof rs !== "object") continue;
    const rsObj = rs as Record<string, unknown>;
    const retKey = `${key.slice(0, -2)}Ret`;
    const ret = rsObj[retKey];
    if (!ret) continue;
    const retList = Array.isArray(ret) ? ret : [ret];
    for (const item of retList) {
      collectFileID(item, result);
    }
  }

  return result;
}

function collectFileID(node: unknown, out: HCPFileID): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.DataExtName === "FileID") {
    if (typeof obj.OwnerID === "string" && !out.ownerID) {
      out.ownerID = obj.OwnerID;
    }
    if (typeof obj.DataExtValue === "string" && !out.fileID) {
      const v = obj.DataExtValue.trim().replace(/[{}]/g, "");
      if (v) out.fileID = v;
    }
  }

  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const child of v) collectFileID(child, out);
    } else if (v && typeof v === "object") {
      collectFileID(v, out);
    }
  }
}
