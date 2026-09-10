/**
 * Credential detection.
 *
 * Needs no real keys — these functions only inspect the ToolContext. Worth
 * pinning because the error WORDING is load-bearing: Barry's tool runtime
 * (packages/tools/src/register.ts) regex-matches "Missing required secrets:"
 * to append the `barry vault set-env` remediation. Reword it and the agent
 * gets a dead end instead of a fix.
 */

import { describe, it, expect } from "vitest";
import { probeCredentials, requireClient } from "./client.js";

const FULL = {
  secrets: {
    EBAY_CLIENT_ID: "app-id",
    EBAY_CERT_ID: "cert-id",
    EBAY_REFRESH_TOKEN: "refresh-token",
  },
};

describe("probeCredentials", () => {
  it("reports every missing secret at once, not just the first", () => {
    const { client, missing } = probeCredentials({ secrets: {} });
    expect(client).toBeNull();
    expect(missing).toEqual(["EBAY_CLIENT_ID", "EBAY_CERT_ID", "EBAY_REFRESH_TOKEN"]);
  });

  // Reporting one at a time turns setup into three round trips.
  it("names only what is actually absent", () => {
    const { missing } = probeCredentials({ secrets: { EBAY_CLIENT_ID: "x" } });
    expect(missing).toEqual(["EBAY_CERT_ID", "EBAY_REFRESH_TOKEN"]);
  });

  it("builds a client when all three are present", () => {
    const { client, missing } = probeCredentials(FULL);
    expect(missing).toEqual([]);
    expect(client).not.toBeNull();
  });

  it("treats a missing context as missing everything, without throwing", () => {
    expect(() => probeCredentials(undefined)).not.toThrow();
    expect(probeCredentials(undefined).missing).toHaveLength(3);
  });
});

describe("requireClient", () => {
  it("throws with the exact wording Barry matches for remediation", () => {
    // If this assertion is loosened, the `barry vault set-env` hint silently
    // stops being appended and the failure becomes unactionable.
    expect(() => requireClient({ secrets: {} })).toThrow(/^Missing required secrets: /);
  });

  it("names the missing secrets in the message", () => {
    expect(() => requireClient({ secrets: { EBAY_CLIENT_ID: "x" } })).toThrow(
      /EBAY_CERT_ID, EBAY_REFRESH_TOKEN/,
    );
  });

  it("returns a client rather than throwing when configured", () => {
    expect(() => requireClient(FULL)).not.toThrow();
  });

  // Secrets re-resolve every turn and differ per barry, so a plain singleton
  // would serve one barry's client to another's session.
  it("reuses a client for identical credentials", () => {
    expect(requireClient(FULL)).toBe(requireClient(FULL));
  });

  it("builds a different client when the credentials change", () => {
    const a = requireClient(FULL);
    const b = requireClient({ secrets: { ...FULL.secrets, EBAY_REFRESH_TOKEN: "other-token" } });
    expect(b).not.toBe(a);
  });
});
