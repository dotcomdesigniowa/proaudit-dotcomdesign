import { describe, it, expect } from "vitest";
import { formatPhone } from "@/lib/formatPhone";

describe("formatPhone", () => {
  it("formats 10 digits correctly", () => {
    expect(formatPhone("3135551234")).toBe("(313) 555-1234");
  });

  it("strips non-digit characters before formatting", () => {
    expect(formatPhone("(313) 555-1234")).toBe("(313) 555-1234");
    expect(formatPhone("313-555-1234")).toBe("(313) 555-1234");
    expect(formatPhone("313.555.1234")).toBe("(313) 555-1234");
  });

  it("handles partial input (<=3 digits)", () => {
    expect(formatPhone("313")).toBe("(313");
    expect(formatPhone("31")).toBe("(31");
  });

  it("handles partial input (4-6 digits)", () => {
    expect(formatPhone("3135")).toBe("(313) 5");
    expect(formatPhone("313555")).toBe("(313) 555");
  });

  it("handles partial input (7-9 digits) - missing digits", () => {
    expect(formatPhone("31355512")).toBe("(313) 555-12");
    // This is the bug scenario: 8 digits stored → incomplete display
    expect(formatPhone("31999999")).toBe("(319) 999-99");
  });

  it("truncates beyond 10 digits", () => {
    expect(formatPhone("31355512345678")).toBe("(313) 555-1234");
  });

  it("returns empty string for empty input", () => {
    expect(formatPhone("")).toBe("");
  });

  it("returns empty string for non-digit input", () => {
    expect(formatPhone("abc")).toBe("");
  });
});
