import { describe, expect, it } from "vitest";
import { formatDuration } from "./ImportDialog";

describe("formatDuration", () => {
  it("shows minutes, or hours for long videos", () => {
    expect(formatDuration(61.4)).toBe("1:01");
    expect(formatDuration(3599.6)).toBe("1:00:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
