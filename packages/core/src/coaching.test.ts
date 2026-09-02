import { describe, expect, it } from "vitest";
import { createPerformanceReportCard } from "./coaching";

const reportInput = (overallScore: number, role: "middle" | "utility" = "middle") => ({
  role,
  overallScore,
  kda: 4,
  farmPerMinute: 8,
  killParticipation: 55,
  damagePerMinute: 800,
  visionPerMinute: 1,
});

describe("performance report cards", () => {
  it.each([[90, "S"], [80, "A"], [70, "B"], [55, "C"], [54, "D"]] as const)("grades score %i as %s", (score, grade) => {
    expect(createPerformanceReportCard(reportInput(score)).grade).toBe(grade);
  });

  it("uses support targets instead of treating low farm as a failure", () => {
    const support = createPerformanceReportCard({ ...reportInput(70, "utility"), kda: 3, farmPerMinute: 1.5, killParticipation: 45, damagePerMinute: 400, visionPerMinute: 2 });
    expect(support.focus).not.toContain("Protect farm through the mid game");
    expect(support.strengths).toContain("Strong vision contribution");
  });
});
