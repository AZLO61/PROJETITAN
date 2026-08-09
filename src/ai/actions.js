export const AI_ACTIONS = Object.freeze({
  MOVE: "MOVE",
  PLAY_CARD: "PLAY_CARD",
  RECOVER: "RECOVER",
  REST: "REST",
  PASS: "PASS",
});

export function isKnownAiAction(type) { return Object.values(AI_ACTIONS).includes(type); }

export function createAiCommand(type, payload = {}) {
  if (!isKnownAiAction(type)) throw new Error(`Unknown AI action: ${type}`);
  return { version: 1, type, ...payload };
}
