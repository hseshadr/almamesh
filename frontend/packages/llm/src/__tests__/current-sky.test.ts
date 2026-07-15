import { describe, expect, it } from "vitest";
import { ALL_SECTIONS } from "../structured-interpretation"; // export ALL_SECTIONS for the test

describe("current_sky section wiring", () => {
  it("is one of the generated sections", () => {
    expect(ALL_SECTIONS).toContain("current_sky");
  });
});
