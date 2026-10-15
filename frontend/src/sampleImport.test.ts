import { describe, expect, it } from "vitest";
import { showSampleImport } from "./sampleImport";

describe("showSampleImport", () => {
  it("shows the sample import only for a developer build", () => {
    expect(showSampleImport(true)).toBe(true);
    expect(showSampleImport(false)).toBe(false);
    expect(showSampleImport(undefined)).toBe(false);
  });
});
