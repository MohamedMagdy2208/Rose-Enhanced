import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptySnapshot } from "../bridge/empty-snapshot";
import {
  runTestLabScenario,
  testLabDemoProfile,
  TestLabPage,
  type TestLabScenarioId,
} from "./TestLabPage";

describe("Test Lab", () => {
  it.each([
    ["happy-path", ["accept", "hover", "lock"]],
    ["primary-unavailable", ["accept", "hover", "lock"]],
    ["intent-protection", ["accept", "hover", "lock"]],
    ["manual-override", ["accept", "hover", "cancel"]],
    ["missing-timer", ["accept", "hover", "observe"]],
    ["no-valid-choice", ["accept", "skip"]],
  ] satisfies Array<[TestLabScenarioId, string[]]>)("runs %s without a live write", (scenarioId, expectedActions) => {
    const result = runTestLabScenario(testLabDemoProfile, scenarioId, "pick");

    expect(result.lcuWriteCount).toBe(0);
    expect(result.guardrailPassed).toBe(true);
    expect(result.events.map((event) => event.action)).toEqual(expectedActions);
  });

  it("protects allied ban intent and chooses the first backup", () => {
    const result = runTestLabScenario(testLabDemoProfile, "intent-protection", "ban");
    const hover = result.events.find((event) => event.action === "hover");

    expect(hover?.championId).toBe(testLabDemoProfile.banPriority[1]);
    expect(hover?.reason).toContain("protected by an allied intent");
  });

  it("renders an explicit isolation boundary before a scenario runs", () => {
    const markup = renderToStaticMarkup(<TestLabPage snapshot={emptySnapshot} />);

    expect(markup).toContain("Test Lab");
    expect(markup).toContain("0 live writes");
    expect(markup).toContain("never connects to League");
    expect(markup).toContain("Built-in safe demo");
  });
});
