import { describe, expect, it } from "vitest";
import { generateBoard, placeTitans } from "../../src/domain/index.js";

// Les snapshots de la pile d'undo (useBoardGeneratorController) sont passés
// de JSON.parse(JSON.stringify(...)) à structuredClone. Ce test vérifie que
// l'état de jeu réel reste clonable et que le clone est bien PROFOND :
// une régression ici ferait que l'annulation d'un coup ne restaure pas le
// plateau, ou pire, partage des tableaux avec l'état courant.
describe("clonage des snapshots d'undo", () => {
  it("clone en profondeur un état de plateau réel", () => {
    const state = generateBoard();
    const clone = structuredClone(state);

    expect(clone).toEqual(state);

    // Les piles de blocs ne doivent pas être partagées avec l'original.
    const key = Object.keys(clone.board).find((k) => clone.board[k].blocks.length > 0);
    expect(key).toBeTruthy();
    const before = state.board[key].blocks.length;
    clone.board[key].blocks.push("bleu");
    expect(state.board[key].blocks).toHaveLength(before);
  });

  it("clone en profondeur l'état des Titans", () => {
    const titanState = placeTitans(4);
    const clone = structuredClone(titanState);

    expect(clone).toEqual(titanState);

    clone.players[0].repaire.push("rouge");
    clone.players[0].hand.pop();
    expect(titanState.players[0].repaire).toHaveLength(0);
    expect(titanState.players[0].hand).toHaveLength(6);
  });

  it("clone les blocs libres, y compris les marqueurs de Socle", () => {
    const looseBlocks = { E5: ["bleu", "socle:3"], A1: [] };
    const clone = structuredClone(looseBlocks);

    expect(clone).toEqual(looseBlocks);
    clone.E5.push("vert");
    expect(looseBlocks.E5).toHaveLength(2);
  });
});
