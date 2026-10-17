import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decide, deviceHash, deviceLabel, isDeviceId, needsAccess, signPass, statusFromRpc, verifyPass, type AccessStatus } from "@/lib/access/core";
import { laterEnd, provisionalEnd, rowFromEntity, userIdFromNotes, verifyPaymentSignature, verifyWebhookSignature } from "@/lib/payments/razorpay-core";
import { DICTS } from "@/lib/i18n";

const base: AccessStatus = { signedIn: true, mode: "subscription", admin: false, device: "match", accessUntil: Date.now() + 86400000 };

describe("access decisions", () => {
  it("open mode lets everyone in", () => expect(decide({ ...base, signedIn: false, mode: "open" })).toBe("allow"));
  it("needs sign-in", () => expect(decide({ ...base, signedIn: false })).toBe("login"));
  it("admins skip device and payment checks", () => expect(decide({ ...base, admin: true, device: "other", accessUntil: null })).toBe("allow"));
  it("first visit registers the device", () => expect(decide({ ...base, device: "none" })).toBe("device"));
  it("another device is blocked even with a paid plan", () => expect(decide({ ...base, device: "other" })).toBe("blocked"));
  it("no or expired plan → subscribe", () => {
    expect(decide({ ...base, accessUntil: null })).toBe("subscribe");
    expect(decide({ ...base, accessUntil: Date.now() - 1 })).toBe("subscribe");
  });
  it("registered device + active plan → allow", () => expect(decide(base)).toBe("allow"));

  it("gates job pages but not landing, login, legal, payments or employer posting", () => {
    for (const p of ["/jobs", "/jobs/remote", "/jobs/some-job-slug", "/go/123", "/profile", "/api/jobs/cards"]) expect(needsAccess(p), p).toBe(true);
    for (const p of ["/", "/login", "/subscribe", "/device", "/terms", "/privacy", "/refunds", "/contact", "/api/razorpay/webhook", "/jobs/post", "/out/fiverr", "/admin/jobs", "/jobsearch"]) expect(needsAccess(p), p).toBe(false);
  });

  it("reads the access_status RPC", () => {
    const s = statusFromRpc({ signed_in: true, mode: "subscription", admin: false, device: "match", access_until: "2026-12-01T00:00:00Z" });
    expect(s).toEqual({ signedIn: true, mode: "subscription", admin: false, device: "match", accessUntil: Date.parse("2026-12-01T00:00:00Z") });
    expect(statusFromRpc(null)).toMatchObject({ signedIn: false, device: "none", accessUntil: null });
  });
});

describe("access pass cookie", () => {
  const secret = "test-secret-at-least-32-characters-long!!";
  it("round-trips and rejects tampering, wrong secret and expiry", async () => {
    const p = { u: "user-1", d: await deviceHash("dev-aaaaaaaaaaaaaaaaaaaaaaaa"), s: base, e: Date.now() + 60000 };
    const tok = await signPass(p, secret);
    expect(await verifyPass(tok, secret)).toEqual(p);
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ ...p, s: { ...base, admin: true } })).toString("base64url");
    expect(await verifyPass(`${forged}.${sig}`, secret)).toBeNull();
    expect(await verifyPass(`${body}.${sig.slice(0, -2)}xx`, secret)).toBeNull();
    expect(await verifyPass(tok, "another-secret-another-secret-another")).toBeNull();
    expect(await verifyPass(await signPass({ ...p, e: Date.now() - 1 }, secret), secret)).toBeNull();
    expect(await verifyPass(tok, "")).toBeNull();
  });
  it("hashes device ids (64 hex) and validates their shape", async () => {
    expect(await deviceHash("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(isDeviceId(crypto.randomUUID())).toBe(true);
    expect(isDeviceId("short")).toBe(false);
    expect(isDeviceId("../../etc/passwd-aaaaaaaaaaaaaa")).toBe(false);
  });
  it("labels devices", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone/iPad");
    expect(deviceLabel(null)).toBe("Browser on Unknown OS");
  });
});

describe("Razorpay", () => {
  const secret = "rzp_secret_123";
  it("verifies checkout signatures against OUR stored subscription id", () => {
    const sig = createHmac("sha256", secret).update("pay_ABC|sub_XYZ").digest("hex");
    expect(verifyPaymentSignature("pay_ABC", "sub_XYZ", sig, secret)).toBe(true);
    expect(verifyPaymentSignature("pay_ABC", "sub_OTHER", sig, secret)).toBe(false);
    expect(verifyPaymentSignature("pay_ABC", "sub_XYZ", sig, "wrong")).toBe(false);
    expect(verifyPaymentSignature("pay_ABC", "sub_XYZ", "", secret)).toBe(false);
  });
  it("verifies webhook signatures on the raw body", () => {
    const body = '{"event":"subscription.charged"}';
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "")).toBe(false);
  });
  it("maps entities and never moves an access period backwards", () => {
    expect(rowFromEntity({ id: "sub_1", status: "active", current_start: 1760000000, current_end: 1762592000, short_url: "https://rzp.io/i/x" }))
      .toEqual({ status: "active", current_start: "2025-10-09T08:53:20.000Z", current_end: "2025-11-08T08:53:20.000Z", short_url: "https://rzp.io/i/x" });
    expect(laterEnd("2026-11-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe("2026-11-01T00:00:00Z");
    expect(laterEnd("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")).toBe("2026-12-01T00:00:00Z");
    expect(laterEnd(null, "2026-12-01T00:00:00Z")).toBe("2026-12-01T00:00:00Z");
    expect(userIdFromNotes({ user_id: "11111111-1111-4111-8111-111111111111" })).toBe("11111111-1111-4111-8111-111111111111");
    expect(userIdFromNotes([])).toBeNull();
    expect(provisionalEnd(new Date("2026-01-31T00:00:00Z"), 1)).toBe("2026-03-03T00:00:00.000Z");
  });
});

describe("subscription UI strings", () => {
  it("exist in English and Telugu", () => {
    for (const k of ["sendOtp", "otpSentTo", "deviceBlockedTitle", "moveToThisDevice", "subscribeTitle", "subscribeCta", "trialDays", "refunds", "contactUs"] as const) {
      expect(DICTS.en[k]).toBeTruthy();
      expect(DICTS.te[k]).toMatch(/[ఀ-౿]|OTP|UPI/);
    }
  });
});

describe("email links (AapStack fragment sessions)", () => {
  it("reads tokens from the fragment and picks the next page", async () => {
    const { afterHashPath, sessionFromHash } = await import("@/lib/client/auth-hash");
    expect(sessionFromHash("#access_token=a.b.c&refresh_token=r1&expires_in=3600&type=signup")).toEqual({ access_token: "a.b.c", refresh_token: "r1", type: "signup" });
    expect(sessionFromHash("#error=verification_failed")).toBeNull();
    expect(sessionFromHash("")).toBeNull();
    expect(afterHashPath("recovery")).toBe("/account/password");
    expect(afterHashPath("signup")).toBe("/device?next=%2Fjobs");
  });
});

describe("email sign-in switch", () => {
  it("env on/off wins, otherwise the admin setting", async () => {
    const { emailLoginFrom } = await import("@/lib/access/core");
    expect(emailLoginFrom("on", false)).toBe(true);
    expect(emailLoginFrom("off", true)).toBe(false);
    expect(emailLoginFrom(undefined, true)).toBe(true);
    expect(emailLoginFrom(undefined, "yes")).toBe(false);
    expect(emailLoginFrom(undefined, undefined)).toBe(false);
  });
});

describe("AapStack REST compatibility", () => {
  it("strips the quotes postgrest-js puts around bulk-insert column names", async () => {
    const { stripQuotedColumns } = await import("@engine/compat-fetch.ts");
    expect(stripQuotedColumns('https://h/p/x/rest/v1/jobs?columns=%22slug%22%2C%22title%22&select=id')).toBe("https://h/p/x/rest/v1/jobs?columns=slug%2Ctitle&select=id");
    expect(stripQuotedColumns('https://h/rest/v1/jobs?columns="slug","title"')).toBe("https://h/rest/v1/jobs?columns=slug%2Ctitle");
    expect(stripQuotedColumns("https://h/rest/v1/jobs?select=id")).toBe("https://h/rest/v1/jobs?select=id");
  });

  it("sends RPC list arguments as Postgres array literals", async () => {
    const { pgArrayLiteral, rpcArraysToLiterals } = await import("@engine/compat-fetch.ts");
    expect(pgArrayLiteral([])).toBe("{}");
    expect(pgArrayLiteral(["a", 'b"c', "d\\e", null, 3])).toBe('{"a","b\\"c","d\\\\e",NULL,"3"}');
    expect(JSON.parse(rpcArraysToLiterals('{"p_source_id":"x","p_seen":["1","2"],"p_q":null}'))).toEqual({ p_source_id: "x", p_seen: '{"1","2"}', p_q: null });
    expect(rpcArraysToLiterals('{"p_days":30}')).toBe('{"p_days":30}');
    expect(rpcArraysToLiterals('{"p":[{"a":1}]}')).toBe('{"p":[{"a":1}]}');
    expect(rpcArraysToLiterals("not json")).toBe("not json");
  });
});
