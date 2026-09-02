import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("contracts source hygiene", () => {
  it("does not contain emitted files that can shadow TypeScript sources", () => {
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    const emittedFiles = readdirSync(sourceDirectory).filter(
      (fileName) => fileName.endsWith(".js") || fileName.endsWith(".d.ts") || fileName.endsWith(".d.ts.map"),
    );

    expect(emittedFiles).toEqual([]);
  });
});
