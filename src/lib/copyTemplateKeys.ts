/**
 * Resolves the correct audit_copy_templates section_key for Under the Hood
 * based on overall grade and provider.
 */
export function getUthKeys(
  overallGrade: string | null,
  provider: string | null
): { bodyKey: string; plainKey: string } {
  const grade = (overallGrade || "F").toUpperCase();
  const isHibuThryv = provider === "Hibu" || provider === "Thryv";

  switch (grade) {
    case "A":
      return { bodyKey: "uth_a", plainKey: "uth_a_plain" };
    case "B":
      return { bodyKey: "uth_b", plainKey: "uth_b_plain" };
    case "C":
      return { bodyKey: "uth_c", plainKey: "uth_c_plain" };
    case "D":
      return isHibuThryv
        ? { bodyKey: "uth_d_branded", plainKey: "uth_d_branded_plain" }
        : { bodyKey: "uth_d_other", plainKey: "uth_d_other_plain" };
    default: // F
      return isHibuThryv
        ? { bodyKey: "uth_f_branded", plainKey: "uth_f_branded_plain" }
        : { bodyKey: "uth_f_other", plainKey: "uth_f_other_plain" };
  }
}
