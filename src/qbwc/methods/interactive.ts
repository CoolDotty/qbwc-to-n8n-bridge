import { env } from "../../config/env";
import { logQBWCMethod } from "../../observability/logger";

export async function getInteractiveURL(_args: { ticket?: string } = {}): Promise<{ getInteractiveURLResult: string }> {
  logQBWCMethod("getInteractiveURL", null, {});
  const base = env.PUBLIC_URL.replace(/\/$/, "");
  return { getInteractiveURLResult: `${base}/qbwc/interactive` };
}

export async function interactiveDone(_args: { ticket?: string } = {}): Promise<{ interactiveDoneResult: string }> {
  logQBWCMethod("interactiveDone", null, {});
  return { interactiveDoneResult: "" };
}

export async function interactiveRejected(_args: { ticket?: string; reason?: string } = {}): Promise<{ interactiveRejectedResult: string }> {
  logQBWCMethod("interactiveRejected", null, { reason: _args.reason });
  return { interactiveRejectedResult: "Interactive mode was rejected by the user." };
}
