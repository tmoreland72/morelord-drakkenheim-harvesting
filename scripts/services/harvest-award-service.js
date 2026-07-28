import { Logger } from "../logger.js";

/**
 * Awards claimed harvesting ingredients to player Actors.
 */
export class HarvestAwardService {

    /**
     * Award all currently claimed, not-yet-awarded components.
     *
     * @param {HarvestSession} session
     * @returns {Promise<object>}
     */
    static async finalize(session) {
        if (!game.user.isGM) {
            return {
                success: false,
                reason: "not-gm",
                message: "Only a GM may finalize harvesting.",
                awarded: [],
                failed: [],
                skipped: []
            };
        }

        if (!session) {
            return {
                success: false,
                reason: "no-session",
                message: "There is no active harvest session.",
                awarded: [],
                failed: [],
                skipped: []
            };
        }

        if (session.finalizedAt) {
            return {
                success: false,
                reason: "already-finalized",
                message: "This harvest session has already been finalized.",
                awarded: [],
                failed: [],
                skipped: []
            };
        }

        const claims =
            session.getClaims();

        if (claims.length === 0) {
            return {
                success: false,
                reason: "no-claims",
                message: "No components have been claimed.",
                awarded: [],
                failed: [],
                skipped: []
            };
        }

        const awarded = [];
        const failed = [];
        const skipped = [];

        for (const claim of claims) {
            const component =
                session.getComponent(
                    claim.creatureId,
                    claim.componentId
                );

            if (!component) {
                failed.push({
                    ...claim,
                    reason: "component-not-found"
                });

                continue;
            }

            /*
             * Important for retry safety.
             */
            if (component.awardedAt) {
                skipped.push({
                    ...claim,
                    reason: "already-awarded"
                });

                continue;
            }

            const actorId =
                claim.claimedBy?.actorId ??
                null;

            if (!actorId) {
                failed.push({
                    ...claim,
                    reason: "no-character",
                    message:
                        `${claim.claimedBy?.userName ?? "Player"} has no character assigned.`
                });

                continue;
            }

            const actor =
                game.actors.get(actorId);

            if (!actor) {
                failed.push({
                    ...claim,
                    reason: "actor-not-found",
                    message:
                        `Could not find Actor ${actorId}.`
                });

                continue;
            }

            const ingredientUuid =
                claim.ingredient?.uuid ??
                null;

            if (!ingredientUuid) {
                failed.push({
                    ...claim,
                    reason: "missing-ingredient",
                    message:
                        `${claim.componentName} has no ingredient UUID.`
                });

                continue;
            }

            let sourceItem = null;

            try {
                sourceItem =
                    await fromUuid(
                        ingredientUuid
                    );
            } catch (error) {
                Logger.error(
                    `Could not resolve ingredient "${ingredientUuid}".`,
                    error
                );
            }

            if (!sourceItem) {
                failed.push({
                    ...claim,
                    reason: "ingredient-not-found",
                    message:
                        `Could not load ${claim.ingredient?.name ?? claim.componentName}.`
                });

                continue;
            }

            try {
                const itemData =
                    sourceItem.toObject();

                /*
                 * A new owned Item needs its own ID.
                 */
                delete itemData._id;

                const createdItems =
                    await actor.createEmbeddedDocuments(
                        "Item",
                        [itemData]
                    );

                const createdItem =
                    createdItems[0] ??
                    null;

                component.awardedAt =
                    Date.now();

                component.awardedTo = {
                    actorId:
                        actor.id,

                    actorName:
                        actor.name,

                    itemId:
                        createdItem?.id ??
                        null,

                    itemName:
                        createdItem?.name ??
                        sourceItem.name
                };

                session.touch();

                awarded.push({
                    creatureId:
                        claim.creatureId,

                    creatureName:
                        claim.creatureName,

                    componentId:
                        claim.componentId,

                    componentName:
                        claim.componentName,

                    ingredientName:
                        sourceItem.name,

                    actorId:
                        actor.id,

                    actorName:
                        actor.name,

                    createdItemId:
                        createdItem?.id ??
                        null
                });

                Logger.log(
                    `Awarded "${sourceItem.name}" to "${actor.name}" from "${claim.creatureName}".`
                );
            } catch (error) {
                Logger.error(
                    `Failed to award "${sourceItem.name}" to "${actor.name}".`,
                    error
                );

                failed.push({
                    ...claim,
                    reason: "item-create-failed",
                    message:
                        `Failed to add ${sourceItem.name} to ${actor.name}.`
                });
            }
        }

        /*
         * Only mark the whole session finalized when all claims
         * have been successfully awarded.
         */
        if (failed.length === 0) {
            session.markFinalized({
                userId:
                    game.user.id,

                userName:
                    game.user.name
            });
        }

        const success =
            failed.length === 0;

        return {
            success,

            reason:
                success
                    ? "finalized"
                    : "partial-failure",

            message:
                success
                    ? `Harvest finalized. ${awarded.length} item${awarded.length === 1 ? "" : "s"} awarded.`
                    : `${awarded.length} item${awarded.length === 1 ? "" : "s"} awarded, but ${failed.length} award${failed.length === 1 ? "" : "s"} failed.`,

            awarded,
            failed,
            skipped
        };
    }
}