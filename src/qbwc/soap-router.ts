/**
 * Hand-rolled SOAP 1.1 router for the QBWC bridge.
 *
 * Replaces the `soap` npm library which has known issues serializing
 * doc/literal responses that reference complexType sequences like
 * tns:ArrayOfString — Intuit's reference server uses this exact pattern
 * and the `soap` lib returned an empty <soap:Body/>. QBWC then raised
 * a NullReferenceException internally ("Object reference not set to an
 * instance of an object", aka QBWC2012).
 *
 * We parse the incoming SOAP envelope, extract the operation name and
 * its child parameters, dispatch to the matching handler, then serialize
 * the response with explicit XML templates that match the WSDL exactly.
 */

import { parseStringPromise } from "xml2js";
import { logger } from "../observability/logger";
import { sanitizeLogString } from "../observability/logger";

const TNS = "http://developer.intuit.com/";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

export interface SoapRouter {
  handle(xml: string): Promise<string>;
}

interface ParsedRequest {
  operation: string;
  args: Record<string, unknown>;
}

export function createSoapRouter(handlers: Record<string, Handler>): SoapRouter {
  return {
    async handle(xml: string): Promise<string> {
      let parsed: ParsedRequest;
      try {
        parsed = await parseRequest(xml);
      } catch (err) {
        logger.warn("SOAP parse failed", { error: (err as Error).message });
        return soapFault("Client", "Malformed SOAP request");
      }

      const handler = handlers[parsed.operation];
      if (!handler) {
        logger.warn("Unknown SOAP operation", { operation: parsed.operation });
        return soapFault("Client", `Unknown operation: ${parsed.operation}`);
      }

      let result: unknown;
      try {
        result = await handler(parsed.args);
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("SOAP handler error", { operation: parsed.operation, error: sanitizeLogString(msg) });
        return soapFault("Server", msg);
      }

      return serializeResponse(parsed.operation, result);
    },
  };
}

async function parseRequest(xml: string): Promise<ParsedRequest> {
  const cleaned = xml.replace(/^\uFEFF/, "").trim();
  const obj = await parseStringPromise(cleaned, {
    explicitArray: false,
    ignoreAttrs: true,
    tagNameProcessors: [stripPrefix],
  });

  const envelope = obj.Envelope ?? obj["soap:Envelope"];
  if (!envelope) throw new Error("No Envelope");
  const body = envelope.Body ?? envelope["soap:Body"];
  if (!body) throw new Error("No Body");

  // Find the first non-meta child of Body
  const operationEntry = Object.entries(body).find(
    ([k]) => !k.startsWith("xmlns") && k !== "$" && !k.includes(":Fault")
  );
  if (!operationEntry) throw new Error("No operation element in Body");
  const [operation, body_] = operationEntry;
  const localName = stripPrefix(operation);
  const inner = (body_ && typeof body_ === "object" ? body_ : {}) as Record<string, unknown>;
  return { operation: localName, args: inner };
}

function stripPrefix(name: string): string {
  const idx = name.indexOf(":");
  return idx >= 0 ? name.slice(idx + 1) : name;
}

function serializeResponse(operation: string, result: unknown): string {
  const responseName = `${operation}Response`;
  const payload = renderPayload(operation, result);
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${responseName} xmlns="${TNS}">${payload}</${responseName}>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Map each method's typed return to the exact XML the WSDL promises.
 *
 *  - serverVersion / clientVersion / getServerVersion / getLastError /
 *    closeConnection / getInteractiveURL / interactiveDone /
 *    interactiveRejected return a string.  We read it from a single
 *    result-named key.
 *  - authenticate returns a string[] of up to 4 elements.  We emit
 *    them inside a single <authenticateResult> wrapped in <string>
 *    elements, matching tns:ArrayOfString.
 *  - sendRequestXML returns a string.  Same as serverVersion.
 *  - receiveResponseXML returns an int.  Emit as text.
 */
function renderPayload(operation: string, result: unknown): string {
  if (result == null || typeof result !== "object") {
    return `<tns:${operation}Result/>`;
  }
  const obj = result as Record<string, unknown>;

  if (operation === "authenticate") {
    const arr = (obj.authenticateResult as unknown[]) ?? [];
    const items = arr
      .map((v) => `<string>${escapeXml(typeof v === "string" ? v : String(v ?? ""))}</string>`)
      .join("");
    return `<authenticateResult>${items}</authenticateResult>`;
  }

  if (operation === "receiveResponseXML") {
    const v = obj.receiveResponseXMLResult;
    return `<receiveResponseXMLResult>${escapeXml(String(v ?? "0"))}</receiveResponseXMLResult>`;
  }

  for (const suffix of ["Result"]) {
    const key = `${operation}${suffix}`;
    if (key in obj) {
      const v = obj[key];
      return `<${key}>${escapeXml(typeof v === "string" ? v : String(v ?? ""))}</${key}>`;
    }
  }

  return "";
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function soapFault(code: string, message: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:${code}</faultcode>
      <faultstring>${escapeXml(message)}</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}
