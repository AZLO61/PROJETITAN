import { describe, expect, it } from "vitest";
import { createAiCommand, AI_ACTIONS, createAiState } from "../../src/ai/index.js";

describe("AI contract", () => {
  it("creates valid commands", () => expect(createAiCommand(AI_ACTIONS.PASS)).toMatchObject({version:1,type:"PASS"}));
  it("creates compact state", () => expect(createAiState({phase:"action",activePlayerId:1,state:{board:{}},titanState:{players:[]}}).phase).toBe("action"));
});
