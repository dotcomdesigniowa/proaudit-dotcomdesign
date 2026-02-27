import { describe, it, expect } from "vitest";
import { getUnderTheHoodCopy } from "@/lib/underTheHoodCopy";

describe("getUnderTheHoodCopy", () => {
  const company = "Acme Corp";

  it("returns A-grade copy regardless of provider", () => {
    const result = getUnderTheHoodCopy(company, "Hibu", "A");
    expect(result.paragraphs[0]).toContain("strong technical foundation");
    expect(result.plainEnglish).toContain("doing its job");
  });

  it("returns B-grade copy regardless of provider", () => {
    const result = getUnderTheHoodCopy(company, "Other", "B");
    expect(result.paragraphs[0]).toContain("solid position overall");
    expect(result.plainEnglish).toContain("few smart improvements");
  });

  it("returns C-grade copy regardless of provider", () => {
    const result = getUnderTheHoodCopy(company, "Thryv", "C");
    expect(result.paragraphs[0]).toContain("mix of strengths");
    expect(result.plainEnglish).toContain("starting to hold you back");
  });

  it("returns D-grade Hibu/Thryv copy with builder reference", () => {
    const hibu = getUnderTheHoodCopy(company, "Hibu", "D");
    expect(hibu.paragraphs[0]).toContain("builder and platform");
    const thryv = getUnderTheHoodCopy(company, "Thryv", "D");
    expect(thryv.paragraphs[0]).toContain("builder and platform");
  });

  it("returns D-grade Other copy without builder reference", () => {
    const result = getUnderTheHoodCopy(company, "Other", "D");
    expect(result.paragraphs[0]).toContain("current technical setup");
    expect(result.paragraphs[0]).not.toContain("builder");
  });

  it("returns F-grade Hibu/Thryv copy with severe builder reference", () => {
    const result = getUnderTheHoodCopy(company, "Hibu", "F");
    expect(result.paragraphs[0]).toContain("severe structural limitations");
    expect(result.paragraphs[0]).toContain("builder and platform");
  });

  it("returns F-grade Other copy without builder reference", () => {
    const result = getUnderTheHoodCopy(company, "Other", "F");
    expect(result.paragraphs[0]).toContain("severe structural deficiencies");
    expect(result.paragraphs[0]).not.toContain("builder");
  });

  it("defaults to F when grade is null", () => {
    const result = getUnderTheHoodCopy(company, "Other", null);
    expect(result.plainEnglish).toContain("actively holding you back");
  });

  it("defaults company name when null", () => {
    const result = getUnderTheHoodCopy(null, "Other", "A");
    expect(result.paragraphs[0]).toContain("This company");
  });

  it("never contains dashes in any grade/provider combo", () => {
    const grades = ["A", "B", "C", "D", "F"];
    const providers = ["Hibu", "Thryv", "Other"];
    for (const g of grades) {
      for (const p of providers) {
        const result = getUnderTheHoodCopy(company, p, g);
        for (const para of result.paragraphs) {
          // Em dash and en dash should not appear (regular hyphens in compound words are OK but the spec says no dashes)
          expect(para).not.toContain("—");
          expect(para).not.toContain("–");
        }
        expect(result.plainEnglish).not.toContain("—");
        expect(result.plainEnglish).not.toContain("–");
      }
    }
  });

  it("always includes company name in first paragraph", () => {
    const grades = ["A", "B", "C", "D", "F"];
    for (const g of grades) {
      const result = getUnderTheHoodCopy("TestBiz", "Other", g);
      expect(result.paragraphs[0]).toContain("TestBiz");
    }
  });
});
