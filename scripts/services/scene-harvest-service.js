import { Logger } from "../logger.js";

/**
 * Finds dead NPC tokens on a Foundry scene.
 */
export class SceneHarvestService {
  /**
   * Return all dead NPC TokenDocuments on a scene.
   *
   * A token is considered dead when:
   * - Its actor HP is 0 or below.
   * - Its actor has the "dead" status.
   * - Its combatant is marked defeated.
   *
   * @param {Scene} scene
   * @returns {TokenDocument[]}
   */
  static getDeadNpcTokens(scene = canvas.scene) {
    if (!scene) {
      Logger.warn("Cannot scan for dead NPCs because no scene is active.");
      return [];
    }

    return scene.tokens.contents.filter((tokenDocument) =>
      this.isDeadNpcToken(tokenDocument)
    );
  }

  /**
   * Determine whether a TokenDocument represents a dead NPC.
   *
   * @param {TokenDocument} tokenDocument
   * @returns {boolean}
   */
  static isDeadNpcToken(tokenDocument) {
    const actor = tokenDocument.actor;

    if (!actor) return false;
    if (actor.type !== "npc") return false;

    return (
      this.hasZeroHitPoints(actor) ||
      this.hasDeadStatus(actor) ||
      this.isDefeatedCombatant(tokenDocument)
    );
  }

  /**
   * Check the standard dnd5e HP path.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  static hasZeroHitPoints(actor) {
    const hp = foundry.utils.getProperty(
      actor,
      "system.attributes.hp.value"
    );

    const numericHp = Number(hp);

    return Number.isFinite(numericHp) && numericHp <= 0;
  }

  /**
   * Check whether the actor currently has the dead status.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  static hasDeadStatus(actor) {
    return actor.statuses?.has("dead") ?? false;
  }

  /**
   * Check all combats for a defeated combatant tied to this token.
   *
   * @param {TokenDocument} tokenDocument
   * @returns {boolean}
   */
  static isDefeatedCombatant(tokenDocument) {
    return game.combats.some((combat) =>
      combat.combatants.some((combatant) =>
        combatant.sceneId === tokenDocument.parent?.id &&
        combatant.tokenId === tokenDocument.id &&
        combatant.defeated
      )
    );
  }

  /**
   * Convert TokenDocuments into simple diagnostic objects.
   *
   * @param {TokenDocument[]} tokens
   * @returns {object[]}
   */
  static summarizeTokens(tokens) {
    return tokens.map((tokenDocument) => {
      const actor = tokenDocument.actor;

      return {
        tokenId: tokenDocument.id,
        tokenName: tokenDocument.name,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        actorType: actor?.type ?? null,
        hp: foundry.utils.getProperty(
          actor,
          "system.attributes.hp.value"
        ),
        deadStatus: actor?.statuses?.has("dead") ?? false,
        defeated: this.isDefeatedCombatant(tokenDocument),
        tokenUuid: tokenDocument.uuid,
        actorUuid: actor?.uuid ?? null
      };
    });
  }

  /**
   * Scan the current scene and report the results.
   *
   * @param {Scene} scene
   * @returns {TokenDocument[]}
   */
  static scanScene(scene = canvas.scene) {
    if (!scene) {
      Logger.warn("Scene scan requested without an active scene.");
      return [];
    }

    const deadTokens = this.getDeadNpcTokens(scene);
    const summary = this.summarizeTokens(deadTokens);

    Logger.log(
      `Found ${deadTokens.length} dead NPC token(s) on scene "${scene.name}".`
    );

    if (summary.length > 0) {
      Logger.debug("Dead NPC token summary:", summary);
      Logger.debug("Dead NPC TokenDocuments:", deadTokens);
    } else {
      Logger.debug(`No dead NPC tokens found on scene "${scene.name}".`);
    }

    return deadTokens;
  }
}