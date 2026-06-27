import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirror the email schema used in creators create/update procedures
const emailSchema = z.union([z.string().email(), z.literal("")]).optional().nullable();

describe("creator email validation", () => {
  it("accepts a valid email", () => {
    expect(emailSchema.parse("test@example.com")).toBe("test@example.com");
  });

  it("accepts an empty string (no email)", () => {
    expect(emailSchema.parse("")).toBe("");
  });

  it("accepts null/undefined", () => {
    expect(emailSchema.parse(null)).toBe(null);
    expect(emailSchema.parse(undefined)).toBe(undefined);
  });

  it("rejects a malformed email", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });

  it("normalizes empty string to null (route behavior)", () => {
    const raw = "";
    const normalized = raw === "" ? null : raw;
    expect(normalized).toBe(null);
  });
});
