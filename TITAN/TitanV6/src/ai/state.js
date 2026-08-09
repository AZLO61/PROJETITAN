export function createAiState({ state, titanState, activePlayerId, phase, mancheNumber, looseBlocks, availableActions = [] }) {
  return {
    version: 1,
    phase, mancheNumber, activePlayerId,
    board: state?.board ?? {},
    looseBlocks: looseBlocks ?? {},
    titans: titanState?.players ?? [],
    order: titanState?.ordreJeu ?? [],
    detonator: titanState?.detonateur ?? null,
    availableActions,
  };
}
