import path from "path";
import fs from "fs";
import { authenticate } from "../qbwc/methods/authenticate";
import { sendRequestXML } from "../qbwc/methods/send-request-xml";
import { receiveResponseXML } from "../qbwc/methods/receive-response-xml";
import { getLastError } from "../qbwc/methods/get-last-error";
import { closeConnection } from "../qbwc/methods/close-connection";
import { getServerVersion } from "../qbwc/methods/get-server-version";
import { connectionError } from "../qbwc/methods/connection-error";
import { getInteractiveURL, interactiveDone, interactiveRejected } from "../qbwc/methods/interactive";
import { env } from "../config/env";

export const qbwcService = {
  serverVersion: async () => ({ serverVersionResult: "QBWC-n8n-Bridge 1.0" }),
  clientVersion: async (args: { strVersion: string }) => {
    return { clientVersionResult: "" };
  },
  authenticate,
  sendRequestXML,
  receiveResponseXML,
  getLastError,
  closeConnection,
  getServerVersion,
  connectionError,
  getInteractiveURL,
  interactiveDone,
  interactiveRejected,
};

export function getWSDL(): string {
  const distPath = path.join(__dirname, "..", "qbwc", "wsdl", "qbwc.wsdl");
  const srcPath = path.join(__dirname, "..", "..", "src", "qbwc", "wsdl", "qbwc.wsdl");
  const wsdlPath = fs.existsSync(distPath) ? distPath : srcPath;
  let wsdl = fs.readFileSync(wsdlPath, "utf-8");
  wsdl = wsdl.replaceAll("REPLACE_WITH_PUBLIC_URL", env.PUBLIC_URL);
  return wsdl;
}
