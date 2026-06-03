import { parseStringPromise } from "xml2js";

export interface ParsedQBResponse {
  statusCode: string;
  statusMessage: string;
  entities: Record<string, unknown>[];
}

export async function parseQBXMLResponse(xml: string): Promise<ParsedQBResponse> {
  const cleaned = xml.trim();
  const obj = await parseStringPromise(cleaned, { explicitArray: false });
  const qbxml = obj.QBXML ?? obj;
  const msgs = qbxml.QBXMLMsgsRs ?? qbxml;

  let statusCode = "0";
  let statusMessage = "";
  const entities: Record<string, unknown>[] = [];

  for (const key of Object.keys(msgs)) {
    if (key.endsWith("Rs")) {
      const rs = msgs[key];
      const attr = rs.$ ?? {};
      if (attr.statusCode !== undefined) statusCode = attr.statusCode;
      if (attr.statusMessage !== undefined) statusMessage = attr.statusMessage;

      if (rs[key.replace("Rs", "Ret")]) {
        const ret = rs[key.replace("Rs", "Ret")];
        const list = Array.isArray(ret) ? ret : [ret];
        for (const item of list) {
          entities.push(normalizeEntity(item));
        }
      }
    }
  }

  return { statusCode, statusMessage, entities };
}

function normalizeEntity(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (k === "$") continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      if (nested.ListID) {
        out[k] = nested;
      } else {
        for (const [nk, nv] of Object.entries(nested)) {
          out[`${k}_${nk}`] = nv;
        }
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}
