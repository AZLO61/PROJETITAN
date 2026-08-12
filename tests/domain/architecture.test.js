import { describe, expect, it } from "vitest";
import { generateBoard, placeTitans } from "../../src/domain/index.js";

describe("domain smoke tests", () => {
  it("generates a board", () => expect(generateBoard()).toBeTruthy());
  it("places four titans", () => expect(placeTitans(4).players).toHaveLength(4));
});
