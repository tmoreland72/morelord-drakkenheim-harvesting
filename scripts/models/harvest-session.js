import { Logger } from "../logger.js";

/**
 * Represents one shared harvesting session for a scene.
 *
 * A player may claim one component from each creature.
 * Each component may only be claimed by one player.
 */
export class HarvestSession {

    /**
     * Build a session from scene harvest results.
     *
     * @param {object[]} harvestResults
     * @param {Scene|null} scene
     * @returns {HarvestSession}
     */
    static fromHarvestResults(
        harvestResults = [],
        scene = canvas.scene
    ) {
        const creatures =
            harvestResults.map(
                (result) =>
                    this.buildCreatureRecord(
                        result
                    )
            );

        return new HarvestSession({
            id:
                foundry.utils.randomID(
                    16
                ),

            sceneId:
                scene?.id ??
                null,

            sceneName:
                scene?.name ??
                null,

            createdAt:
                Date.now(),

            createdBy:
                game.user?.id ??
                null,

            creatures
        });
    }


    /**
     * Restore a session from serialized socket data.
     *
     * @param {object|null} data
     * @returns {HarvestSession|null}
     */
    static fromObject(data) {
        if (
            !data ||
            typeof data !== "object"
        ) {
            return null;
        }

        return new HarvestSession({
            id:
                data.id,

            sceneId:
                data.sceneId,

            sceneName:
                data.sceneName,

            createdAt:
                data.createdAt,

            createdBy:
                data.createdBy,

            updatedAt:
                data.updatedAt,

            finalizedAt:
                data.finalizedAt,

            finalizedBy:
                data.finalizedBy,

            creatures:
                foundry.utils.deepClone(
                    data.creatures ??
                    []
                )
        });
    }


    /**
     * Convert one scan result into a creature record.
     *
     * @param {object} result
     * @returns {object}
     */
    static buildCreatureRecord(result) {
        const tokenDocument =
            result.tokenDocument;

        const monsterActor =
            result.monsterActor;

        const ingredientMatches =
            result.ingredientMatches ??
            [];

        const creatureId =
            tokenDocument?.uuid ??
            tokenDocument?.id ??
            foundry.utils.randomID(
                16
            );

        const components =
            ingredientMatches.map(
                (match, index) => {
                    const component =
                        match.component ??
                        {};

                    return {
                        id:
                            this.buildComponentId({
                                creatureId,
                                component,
                                index
                            }),

                        index,

                        category:
                            component.category ??
                            "Unknown",

                        componentName:
                            component.name ??
                            "Unknown",

                        rarity:
                            match.rarity ??
                            result.harvestData
                                ?.rarity ??
                            null,

                        status:
                            match.status ??
                            "unmatched",

                        matched:
                            Boolean(
                                match.matched
                            ),

                        ingredient:
                            match.item
                                ? {
                                    id:
                                        match.item.id ??
                                        null,

                                    uuid:
                                        match.item.uuid ??
                                        null,

                                    name:
                                        match.item.name ??
                                        null,

                                    img:
                                        match.item.img ??
                                        null,

                                    rarity:
                                        match.item.rarity ??
                                        null,

                                    score:
                                        match.item.score ??
                                        null
                                }
                                : null,

                        claimedBy:
                            null,

                        claimedAt:
                            null,

                        awardedAt:
                            null,

                        awardedTo:
                            null
                    };
                }
            );

        return {
            id:
                creatureId,

            tokenId:
                tokenDocument?.id ??
                null,

            tokenUuid:
                tokenDocument?.uuid ??
                null,

            tokenName:
                tokenDocument?.name ??
                monsterActor?.name ??
                "Unknown Creature",

            actorId:
                monsterActor?.id ??
                null,

            actorUuid:
                monsterActor?.uuid ??
                null,

            actorName:
                monsterActor?.name ??
                tokenDocument?.name ??
                "Unknown Creature",

            img:
                monsterActor?.img ??
                tokenDocument
                    ?.texture
                    ?.src ??
                null,

            rarity:
                result.harvestData
                    ?.rarity ??
                null,

            components
        };
    }


    /**
     * Build a stable component identifier.
     */
    static buildComponentId({
        creatureId,
        component,
        index
    }) {
        const category =
            this.normalizeIdPart(
                component?.category
            );

        const componentName =
            this.normalizeIdPart(
                component?.name
            );

        return [
            creatureId,
            index,
            category,
            componentName
        ].join("::");
    }


    static normalizeIdPart(value) {
        return String(value ?? "")
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[’']/g, "")
            .replace(
                /[^a-z0-9]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            );
    }


    constructor({
        id,
        sceneId,
        sceneName,
        createdAt,
        createdBy,
        updatedAt,
        finalizedAt,
        finalizedBy,
        creatures = []
    }) {
        this.id =
            id ??
            foundry.utils.randomID(
                16
            );

        this.sceneId =
            sceneId ??
            null;

        this.sceneName =
            sceneName ??
            null;

        this.createdAt =
            createdAt ??
            Date.now();

        this.createdBy =
            createdBy ??
            null;

        this.updatedAt =
            updatedAt ??
            Date.now();

        this.finalizedAt =
            finalizedAt ??
            null;

        this.finalizedBy =
            finalizedBy ??
            null;

        this.creatures =
            creatures;
    }


    getCreature(creatureId) {
        return (
            this.creatures.find(
                (creature) =>
                    creature.id ===
                    creatureId
            ) ??
            null
        );
    }


    getComponent(
        creatureId,
        componentId
    ) {
        const creature =
            this.getCreature(
                creatureId
            );

        if (!creature) {
            return null;
        }

        return (
            creature.components.find(
                (component) =>
                    component.id ===
                    componentId
            ) ??
            null
        );
    }


    getUserClaimForCreature(
        creatureId,
        userId
    ) {
        const creature =
            this.getCreature(
                creatureId
            );

        if (!creature) {
            return null;
        }

        return (
            creature.components.find(
                (component) =>
                    component.claimedBy
                        ?.userId ===
                    userId
            ) ??
            null
        );
    }


    claimComponent({
        creatureId,
        componentId,
        userId,
        userName,
        actorId = null,
        actorName = null
    }) {
        if (this.finalizedAt) {
            return {
                success: false,
                reason: "session-finalized",
                message:
                    "This harvest session has already been finalized."
            };
        }

        if (!userId) {
            return {
                success: false,
                reason: "missing-user",
                message:
                    "A user is required to claim a component."
            };
        }

        const creature =
            this.getCreature(
                creatureId
            );

        if (!creature) {
            return {
                success: false,
                reason: "creature-not-found",
                message:
                    "The selected creature could not be found."
            };
        }

        const component =
            this.getComponent(
                creatureId,
                componentId
            );

        if (!component) {
            return {
                success: false,
                reason: "component-not-found",
                message:
                    "The selected component could not be found."
            };
        }

        if (
            !component.matched ||
            !component.ingredient?.uuid
        ) {
            return {
                success: false,
                reason: "component-unavailable",
                message:
                    "That component does not have a usable ingredient Item."
            };
        }

        if (component.awardedAt) {
            return {
                success: false,
                reason: "already-awarded",
                message:
                    "That component has already been awarded."
            };
        }

        if (
            component.claimedBy &&
            component.claimedBy.userId !==
                userId
        ) {
            return {
                success: false,
                reason: "already-claimed",
                message:
                    `${component.componentName} has already been claimed by ${component.claimedBy.userName}.`
            };
        }

        const existingClaim =
            this.getUserClaimForCreature(
                creatureId,
                userId
            );

        if (
            existingClaim &&
            existingClaim.id !==
                componentId
        ) {
            return {
                success: false,
                reason: "user-already-claimed",
                message:
                    `You have already claimed ${existingClaim.componentName} from ${creature.actorName}.`
            };
        }

        component.claimedBy = {
            userId,

            userName:
                userName ??
                game.users.get(userId)
                    ?.name ??
                "Unknown User",

            actorId,

            actorName
        };

        component.claimedAt =
            Date.now();

        this.touch();

        Logger.log(
            `"${component.componentName}" from "${creature.actorName}" was claimed by "${component.claimedBy.userName}".`
        );

        return {
            success: true,
            reason: "claimed",
            message:
                `${component.componentName} claimed.`,
            creature,
            component
        };
    }


    releaseComponent({
        creatureId,
        componentId,
        userId,
        isGM = false
    }) {
        if (this.finalizedAt) {
            return {
                success: false,
                reason: "session-finalized",
                message:
                    "This harvest session has already been finalized."
            };
        }

        const creature =
            this.getCreature(
                creatureId
            );

        if (!creature) {
            return {
                success: false,
                reason: "creature-not-found",
                message:
                    "The selected creature could not be found."
            };
        }

        const component =
            this.getComponent(
                creatureId,
                componentId
            );

        if (!component) {
            return {
                success: false,
                reason: "component-not-found",
                message:
                    "The selected component could not be found."
            };
        }

        if (component.awardedAt) {
            return {
                success: false,
                reason: "already-awarded",
                message:
                    "That component has already been awarded."
            };
        }

        if (!component.claimedBy) {
            return {
                success: true,
                reason: "already-available",
                message:
                    "That component is already available.",
                creature,
                component
            };
        }

        if (
            !isGM &&
            component.claimedBy.userId !==
                userId
        ) {
            return {
                success: false,
                reason: "not-owner",
                message:
                    "Only the claiming player or the GM may release this component."
            };
        }

        const previousClaim =
            component.claimedBy;

        component.claimedBy =
            null;

        component.claimedAt =
            null;

        this.touch();

        Logger.log(
            `"${component.componentName}" from "${creature.actorName}" was released by "${previousClaim.userName}".`
        );

        return {
            success: true,
            reason: "released",
            message:
                `${component.componentName} released.`,
            creature,
            component
        };
    }


    /**
     * Mark the session completely finalized.
     */
    markFinalized({
        userId,
        userName
    }) {
        this.finalizedAt =
            Date.now();

        this.finalizedBy = {
            userId:
                userId ??
                null,

            userName:
                userName ??
                null
        };

        this.touch();

        Logger.log(
            `Harvest session "${this.id}" was finalized by "${userName ?? userId ?? "GM"}".`
        );
    }


    getClaims() {
        return this.creatures.flatMap(
            (creature) =>
                creature.components
                    .filter(
                        (component) =>
                            Boolean(
                                component.claimedBy
                            )
                    )
                    .map(
                        (component) => ({
                            creatureId:
                                creature.id,

                            creatureName:
                                creature.actorName,

                            componentId:
                                component.id,

                            category:
                                component.category,

                            componentName:
                                component.componentName,

                            ingredient:
                                component.ingredient,

                            claimedBy:
                                component.claimedBy,

                            claimedAt:
                                component.claimedAt,

                            awardedAt:
                                component.awardedAt,

                            awardedTo:
                                component.awardedTo
                        })
                    )
        );
    }


    getClaimsForUser(userId) {
        return this.getClaims().filter(
            (claim) =>
                claim.claimedBy
                    ?.userId ===
                userId
        );
    }


    getSummary() {
        const components =
            this.creatures.flatMap(
                (creature) =>
                    creature.components
            );

        const claimed =
            components.filter(
                (component) =>
                    Boolean(
                        component.claimedBy
                    )
            );

        const awarded =
            components.filter(
                (component) =>
                    Boolean(
                        component.awardedAt
                    )
            );

        const available =
            components.filter(
                (component) =>
                    component.matched &&
                    !component.claimedBy &&
                    !component.awardedAt
            );

        const unavailable =
            components.filter(
                (component) =>
                    !component.matched
            );

        return {
            sessionId:
                this.id,

            sceneId:
                this.sceneId,

            sceneName:
                this.sceneName,

            creatures:
                this.creatures.length,

            components:
                components.length,

            claimed:
                claimed.length,

            awarded:
                awarded.length,

            available:
                available.length,

            unavailable:
                unavailable.length,

            finalized:
                Boolean(
                    this.finalizedAt
                ),

            finalizedAt:
                this.finalizedAt
        };
    }


    touch() {
        this.updatedAt =
            Date.now();
    }


    toObject() {
        return {
            id:
                this.id,

            sceneId:
                this.sceneId,

            sceneName:
                this.sceneName,

            createdAt:
                this.createdAt,

            createdBy:
                this.createdBy,

            updatedAt:
                this.updatedAt,

            finalizedAt:
                this.finalizedAt,

            finalizedBy:
                foundry.utils.deepClone(
                    this.finalizedBy
                ),

            creatures:
                foundry.utils.deepClone(
                    this.creatures
                )
        };
    }
}