/**
 * Generates the "UNDER THE HOOD" section copy based on Overall Grade and Provider.
 * Returns { paragraphs: string[], plainEnglish: string }
 */

type Provider = "Hibu" | "Thryv" | "Other" | string | null;

export function getUnderTheHoodCopy(
  companyName: string | null,
  provider: Provider,
  overallGrade: string | null
): { paragraphs: string[]; plainEnglish: string } {
  const name = companyName || "This company";
  const grade = overallGrade || "F";
  const isHibuThryv = provider === "Hibu" || provider === "Thryv";

  switch (grade) {
    case "A":
      return {
        paragraphs: [
          `${name}'s website appears to be built on a strong technical foundation. It is performing well in the areas that most impact visibility, usability, and long term stability. From what we can see, the structure of the site supports search visibility, mobile performance, and accessibility in a way that positions the business well online.`,
        ],
        plainEnglish:
          "Your website is doing its job and is likely helping customers find and trust you online.",
      };

    case "B":
      return {
        paragraphs: [
          `${name}'s website is in a solid position overall. The core technical structure is sound and it is performing well in the areas that matter most for online visibility and user experience. There are a few smaller technical items worth tightening up. Addressing them would improve consistency, reduce friction, and strengthen performance over time.`,
        ],
        plainEnglish:
          "Your website is working, but a few smart improvements could help you get even more out of it.",
      };

    case "C":
      return {
        paragraphs: [
          `${name}'s website shows a mix of strengths and technical warning signs. While it is not in immediate crisis, there are structural issues that can begin to limit visibility and performance if left unaddressed. Over time, these types of issues can make it harder for customers to consistently find you online and easier for competitors to outrank you.`,
        ],
        plainEnglish:
          "Your website is not broken, but it is starting to hold you back and should be addressed before the issues grow.",
      };

    case "D":
      if (isHibuThryv) {
        return {
          paragraphs: [
            `${name} appears to be a well established and reputable business with real credibility in the marketplace. However, the website and online presence do not reflect that same level of strength. The builder and platform currently powering the website introduce major structural limitations under the hood. While the site may look functional, the way it is built is creating serious visibility and performance problems.`,
          ],
          plainEnglish:
            "The website you are currently paying for is likely limiting your online reach and making it harder for customers to consistently find you.",
        };
      }
      return {
        paragraphs: [
          `${name} appears to be a well established and reputable business with real credibility in the marketplace. However, the website and online presence do not reflect that same level of strength. The current technical setup of the site shows major structural deficiencies under the hood. While the site may look functional on the surface, the way it is built is creating serious visibility and performance problems.`,
        ],
        plainEnglish:
          "The website is likely limiting your online reach and making it harder for customers to consistently find you.",
      };

    default: // F
      if (isHibuThryv) {
        return {
          paragraphs: [
            `${name} appears to be a well established and reputable business with real credibility in the marketplace. However, the website, online presence, and overall digital reputation do not reflect that same level of strength. The builder and platform currently powering the website introduce severe structural limitations under the hood. While the site may appear active, the way it is built is creating major visibility, performance, and trust issues.`,
          ],
          plainEnglish:
            "Your current website setup is actively holding you back and making it difficult for customers to find and trust you online.",
        };
      }
      return {
        paragraphs: [
          `${name} appears to be a well established and reputable business with real credibility in the marketplace. However, the website, online presence, and overall digital reputation do not reflect that same level of strength. The technical condition of the site shows severe structural deficiencies under the hood. While it may appear functional, the way it is built is creating major visibility, performance, and trust issues.`,
        ],
        plainEnglish:
          "Your website is actively holding you back and reducing your ability to compete online.",
      };
  }
}
