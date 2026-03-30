import { describe, it, expect } from "vitest";
import { shouldInitMap } from "../operations-map";

describe("shouldInitMap guard", () => {
  it("returns false when token is missing", () => {
    expect(shouldInitMap(undefined, document.createElement("div"), null)).toBe(false);
  });

  it("returns false when container is missing", () => {
    expect(shouldInitMap("token", null, null)).toBe(false);
  });

  it("returns false when map already exists", () => {
    expect(shouldInitMap("token", document.createElement("div"), {} as unknown)).toBe(false);
  });

  it("returns true when token and container are present and no existing map", () => {
    expect(shouldInitMap("token", document.createElement("div"), null)).toBe(true);
  });
});
