import { describe, expect, it } from "vitest";
import { COMMANDS, inScope, keyLabel } from "./keymap";

// A stand-in element that sits inside the given selectors.
const inside = (...selectors: string[]) => ({
  closest: (list: string) =>
    list.split(",").some((s) => selectors.includes(s.trim())) || null,
});

describe("keymap", () => {
  it("gives every key to one command", () => {
    const keys = COMMANDS.flatMap((c) => c.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
  });

  it("writes keys in the platform's notation", () => {
    // Tests do not run under a Mac user agent.
    expect(keyLabel("Control+Alt+Digit3")).toBe("Ctrl+Alt+3");
    expect(keyLabel("$mod+Shift+KeyJ")).toBe("Ctrl+Shift+J");
    expect(keyLabel("ArrowUp")).toBe("↑");
  });

  it("keeps single keys away from fields, dialogs and controls that use them", () => {
    const plain = inside();
    expect(inScope("editor", "Space", plain)).toBe(true);
    expect(inScope("editor", "Space", inside("textarea"))).toBe(false);
    expect(inScope("editor", "KeyJ", inside(".ant-select"))).toBe(false);
    expect(inScope("global", "KeyK", inside("textarea"))).toBe(true);
    expect(inScope("global", "KeyK", inside(".ant-modal"))).toBe(false);
    expect(inScope("editor", "Space", inside("button"))).toBe(true);
    expect(inScope("editor", "Enter", inside("button"))).toBe(false);
    expect(inScope("editor", "ArrowLeft", inside("[role='slider']"))).toBe(false);
    expect(inScope("editor", "ArrowLeft", plain)).toBe(true);
    expect(inScope("editor", "Space", null)).toBe(true);
  });
});
