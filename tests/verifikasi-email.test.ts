import { describe, expect, it } from "vitest";
import { emailSendProblem, isNetworkError } from "../src/lib/auth-errors";
import { dict } from "../src/lib/i18n";

describe("kirim ulang email konfirmasi", () => {
  it("batas kirim, alamat yang ditolak server email bawaan, dan gangguan jaringan dikenali", () => {
    expect(emailSendProblem({ code: "over_email_send_rate_limit", status: 429 })).toBe("rateLimited");
    expect(emailSendProblem({ status: 429 })).toBe("rateLimited");
    expect(emailSendProblem({ code: "email_address_not_authorized", status: 400 })).toBe("emailNotAllowed");
    expect(emailSendProblem({ name: "AuthRetryableFetchError", status: 0 })).toBe("network");
    expect(emailSendProblem({ code: "user_already_exists", status: 422 })).toBeNull();
    expect(isNetworkError({ status: 503 })).toBe(true);
  });

  it("setiap alasan punya pesan di kedua bahasa", () => {
    for (const lang of ["id", "en"] as const) {
      const t = dict(lang).auth;
      for (const k of ["rateLimited", "emailNotAllowed", "network"] as const) expect(t[k]).toBeTruthy();
      expect(t.resent("a@b.id")).toContain("a@b.id");
      expect(t.resendIn(42)).toContain("42");
    }
    expect(dict("en").auth.resend).toBe("Resend confirmation email");
  });
});
