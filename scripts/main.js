import {
    MODULE_ID,
    MODULE_TITLE
} from "./constants.js";

import { Logger } from "./logger.js";

import {
    HarvestSession
} from "./models/harvest-session.js";

import {
    SceneHarvestService
} from "./services/scene-harvest-service.js";

import {
    MonsterDataService
} from "./services/monster-data-service.js";

import {
    IngredientService
} from "./services/ingredient-service.js";

import {
    HarvestSocketService
} from "./services/harvest-socket-service.js";

import {
    HarvestAwardService
} from "./services/harvest-award-service.js";

import {
    HarvestApp
} from "./apps/harvest-app.js";


let currentHarvestSession = null;


Hooks.once("init", () => {
    Logger.log("Initializing");
});


Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) {
        return;
    }

    const tokenControls =
        controls.tokens;

    if (!tokenControls) {
        Logger.warn(
            "Token Controls group was not found."
        );

        return;
    }

    tokenControls.tools ??= {};

    tokenControls.tools.morelordDrakkenheimHarvest = {
        name:
            "morelordDrakkenheimHarvest",

        title:
            "Harvest Dead Creatures",

        icon:
            "fa-solid fa-scalpel",

        order:
            100,

        button:
            true,

        visible:
            true,

        onChange: () => {
            void scanCurrentScene();
        }
    };

    Logger.debug(
        "Registered Harvest Dead Creatures scene-control button."
    );
});


Hooks.once("ready", async () => {
    const module =
        game.modules.get(MODULE_ID);

    if (!module) {
        Logger.error(
            "Module registration could not be found."
        );

        return;
    }

    validateDependencies();

    HarvestSocketService.initialize({
        getSession: () => {
            return currentHarvestSession;
        },

        setSession: (session) => {
            currentHarvestSession =
                session;
        },

        onSessionChanged: (session) => {
            Logger.debug(
                "Harvest session changed:",
                session?.toObject?.() ??
                null
            );

            if (session) {
                void HarvestApp.open();
            } else {
                void HarvestApp.closeOpen();
            }
        }
    });

    await IngredientService
        .getIngredientIndex();

    module.api = {
        /**
         * Scan a scene and return complete harvesting results
         * without creating a shared harvesting session.
         */
        scanScene: async (
            scene = canvas.scene
        ) => {
            if (!scene) {
                Logger.warn(
                    "API scene scan requested without an active scene."
                );

                return [];
            }

            return buildHarvestResults(
                scene
            );
        },

        /**
         * Scan a scene and create a new shared harvesting session.
         *
         * Only a GM may create the canonical session.
         */
        createHarvestSession: async (
            scene = canvas.scene
        ) => {
            if (!game.user.isGM) {
                Logger.warn(
                    "A non-GM attempted to create a harvest session."
                );

                ui.notifications.warn(
                    "Only a GM may create a harvest session."
                );

                return null;
            }

            if (!scene) {
                Logger.warn(
                    "Cannot create a harvest session without an active scene."
                );

                ui.notifications.warn(
                    "There is no active scene to scan."
                );

                return null;
            }

            const harvestResults =
                await buildHarvestResults(
                    scene
                );

            if (
                harvestResults.length === 0
            ) {
                ui.notifications.info(
                    "No dead Monsters of Drakkenheim were found on this scene."
                );

                return null;
            }

            currentHarvestSession =
                HarvestSession
                    .fromHarvestResults(
                        harvestResults,
                        scene
                    );

            HarvestSocketService
                .broadcastSession(
                    currentHarvestSession
                );

            await HarvestApp.open();

            const summary =
                currentHarvestSession
                    .getSummary();

            Logger.log(
                `Created harvest session "${currentHarvestSession.id}" for "${scene.name}".`
            );

            Logger.debug(
                "Harvest session:",
                currentHarvestSession
                    .toObject()
            );

            ui.notifications.info(
                `Harvest session created with ${summary.creatures} creature${summary.creatures === 1
                    ? ""
                    : "s"
                } and ${summary.available} available component${summary.available === 1
                    ? ""
                    : "s"
                }.`
            );

            return currentHarvestSession;
        },

        /**
         * Return the current synchronized harvest session.
         */
        getHarvestSession: () => {
            return currentHarvestSession;
        },

        /**
         * Request the current canonical session from the GM.
         */
        requestHarvestSession: () => {
            HarvestSocketService
                .requestSession();

            return true;
        },

        /**
         * Clear the current canonical harvest session.
         *
         * Only a GM may clear the shared session.
         */
        clearHarvestSession: () => {
            if (!game.user.isGM) {
                Logger.warn(
                    "A non-GM attempted to clear the harvest session."
                );

                ui.notifications.warn(
                    "Only a GM may clear the harvest session."
                );

                return false;
            }

            currentHarvestSession =
                null;

            HarvestSocketService
                .broadcastSessionCleared();

            Logger.log(
                "Cleared the current harvest session."
            );

            ui.notifications.info(
                "The harvest session was cleared."
            );

            return true;
        },

        /**
         * Award all claimed ingredients and finalize the session.
         */
        finalizeHarvest: async () => {
            if (!game.user.isGM) {
                ui.notifications.warn(
                    "Only a GM may finalize harvesting."
                );

                return {
                    success: false,
                    reason: "not-gm"
                };
            }

            if (!currentHarvestSession) {
                ui.notifications.warn(
                    "There is no active harvest session."
                );

                return {
                    success: false,
                    reason: "no-session"
                };
            }

            const result =
                await HarvestAwardService.finalize(
                    currentHarvestSession
                );

            if (result.success) {
                const completionMessage =
                    "Harvesting has been completed.";

                /*
                 * Clear and close locally first. Do not rely on the
                 * socket server echoing the GM's own message.
                 */
                currentHarvestSession = null;

                await HarvestApp.closeOpen();

                ui.notifications.info(
                    completionMessage
                );

                HarvestSocketService
                    .broadcastHarvestCompleted(
                        completionMessage
                    );
            } else {
                /*
                 * A partial award changes the retry-safe session state.
                 * Keep the window open and synchronize that state.
                 */
                HarvestSocketService
                    .broadcastSession(
                        currentHarvestSession
                    );

                HarvestApp.refresh();

                ui.notifications.warn(
                    result.message
                );
            }

            Logger.debug(
                "Harvest finalization result:",
                result
            );

            if (result.awarded.length > 0) {
                console.table(
                    result.awarded
                );
            }

            if (result.failed.length > 0) {
                console.table(
                    result.failed
                );
            }

            return result;
        },

        /**
         * Claim a component through the authoritative GM.
         */
        claimComponent: async ({
            creatureId,
            componentId,
            actorId =
            game.user.character?.id ??
            null,
            actorName =
            game.user.character?.name ??
            null
        }) => {
            const result =
                await HarvestSocketService
                    .requestClaim({
                        creatureId,
                        componentId,
                        actorId,
                        actorName
                    });

            if (result.success) {
                ui.notifications.info(
                    result.message
                );
            } else {
                ui.notifications.warn(
                    result.message
                );
            }

            return result;
        },

        /**
         * Release a component through the authoritative GM.
         */
        releaseComponent: async ({
            creatureId,
            componentId
        }) => {
            const result =
                await HarvestSocketService
                    .requestRelease({
                        creatureId,
                        componentId
                    });

            if (result.success) {
                ui.notifications.info(
                    result.message
                );
            } else {
                ui.notifications.warn(
                    result.message
                );
            }

            return result;
        },

        /**
         * Return all claims in the current session.
         */
        getClaims: () => {
            return (
                currentHarvestSession
                    ?.getClaims() ??
                []
            );
        },

        /**
         * Return claims belonging to a specific user.
         */
        getClaimsForUser: (
            userId = game.user.id
        ) => {
            return (
                currentHarvestSession
                    ?.getClaimsForUser(
                        userId
                    ) ??
                []
            );
        },

        /**
         * Return a summary of the current session.
         */
        getHarvestSessionSummary: () => {
            return (
                currentHarvestSession
                    ?.getSummary() ??
                null
            );
        },

        /**
         * Return all dead NPC tokens before checking whether they
         * belong to Monsters of Drakkenheim.
         */
        getDeadNpcTokens: (
            scene = canvas.scene
        ) => {
            return SceneHarvestService
                .getDeadNpcTokens(
                    scene
                );
        },

        /**
         * Find the Monsters of Drakkenheim compendium Actor
         * corresponding to a provided Actor.
         */
        findMonsterActor: (actor) => {
            return MonsterDataService
                .findMonsterActor(
                    actor
                );
        },

        /**
         * Inspect a matched monster Actor for biography embeds,
         * harvesting components, and evaluated rarity.
         */
        inspectHarvestData: (
            monsterActor
        ) => {
            return MonsterDataService
                .inspectHarvestData(
                    monsterActor
                );
        },

        /**
         * Match parsed components to Antics & Rolls ingredient Items.
         */
        matchHarvestComponents: (
            monsterActor,
            harvestData
        ) => {
            return IngredientService
                .matchHarvestComponents(
                    monsterActor,
                    harvestData
                );
        },

        /**
         * Rebuild the Monsters of Drakkenheim Actor index.
         */
        rebuildMonsterIndex: () => {
            return MonsterDataService
                .getMonsterIndex({
                    force: true
                });
        },

        /**
         * Rebuild the Antics & Rolls ingredient index.
         */
        rebuildIngredientIndex: () => {
            return IngredientService
                .getIngredientIndex({
                    force: true
                });
        },

        openHarvestApp: async () => {
            return HarvestApp.open();
        },

        closeHarvestApp: async () => {
            return HarvestApp.closeOpen();
        }
    };

    Logger.log("Ready");

    Logger.debug(
        "Public API registered:",
        module.api
    );

    /*
     * Player clients request the current session after their
     * API and socket listener are ready.
     */
    if (!game.user.isGM) {
        HarvestSocketService
            .requestSession();
    }
});


/**
 * Scan a scene and build complete harvesting results.
 *
 * This method:
 * - Finds dead NPC tokens.
 * - Rejects actors outside Monsters of Drakkenheim.
 * - Parses harvesting components.
 * - Matches components to ingredient Items.
 *
 * @param {Scene} scene
 * @returns {Promise<object[]>}
 */
async function buildHarvestResults(scene) {
    const deadTokens =
        SceneHarvestService
            .scanScene(
                scene
            );

    if (
        deadTokens.length === 0
    ) {
        return [];
    }

    const matchResults =
        await MonsterDataService
            .matchDeadTokens(
                deadTokens
            );

    const matches =
        matchResults.filter(
            (result) =>
                result.matched
        );

    const harvestResults = [];

    for (const match of matches) {
        const harvestData =
            await MonsterDataService
                .inspectHarvestData(
                    match.monsterActor
                );

        const ingredientMatches =
            await IngredientService
                .matchHarvestComponents(
                    match.monsterActor,
                    harvestData
                );

        harvestResults.push({
            ...match,
            harvestData,
            ingredientMatches
        });
    }

    return harvestResults;
}


/**
 * Scan the active scene, display diagnostics, create the canonical
 * harvest session, and broadcast it to all connected clients.
 *
 * @returns {Promise<HarvestSession|null>}
 */
async function scanCurrentScene() {
    const scene =
        canvas.scene;

    if (!scene) {
        Logger.warn(
            "Harvest button clicked without an active scene."
        );

        ui.notifications.warn(
            "There is no active scene to scan."
        );

        return null;
    }

    try {
        const deadTokens =
            SceneHarvestService
                .scanScene(
                    scene
                );

        if (
            deadTokens.length === 0
        ) {
            ui.notifications.info(
                `No dead NPCs were found on ${scene.name}.`
            );

            return null;
        }

        const matchResults =
            await MonsterDataService
                .matchDeadTokens(
                    deadTokens
                );

        const matches =
            matchResults.filter(
                (result) =>
                    result.matched
            );

        const rejected =
            matchResults.filter(
                (result) =>
                    !result.matched
            );

        if (
            rejected.length > 0
        ) {
            Logger.debug(
                "Rejected dead NPCs because they do not match the Monsters of Drakkenheim compendium:",
                rejected.map(
                    (result) => ({
                        tokenId:
                            result
                                .tokenDocument
                                ?.id ??
                            null,

                        token:
                            result
                                .tokenDocument
                                ?.name ??
                            null,

                        actorId:
                            result
                                .sceneActor
                                ?.id ??
                            null,

                        actor:
                            result
                                .sceneActor
                                ?.name ??
                            null
                    })
                )
            );
        }

        if (
            matches.length === 0
        ) {
            Logger.log(
                `Rejected all ${deadTokens.length} dead NPC token(s); none matched the Monsters of Drakkenheim compendium.`
            );

            ui.notifications.info(
                "No dead Monsters of Drakkenheim were found on this scene."
            );

            return null;
        }

        const harvestResults = [];

        for (const match of matches) {
            const harvestData =
                await MonsterDataService
                    .inspectHarvestData(
                        match.monsterActor
                    );

            const ingredientMatches =
                await IngredientService
                    .matchHarvestComponents(
                        match.monsterActor,
                        harvestData
                    );

            harvestResults.push({
                ...match,
                harvestData,
                ingredientMatches
            });
        }

        currentHarvestSession =
            HarvestSession
                .fromHarvestResults(
                    harvestResults,
                    scene
                );

        HarvestSocketService
            .broadcastSession(
                currentHarvestSession
            );

        await HarvestApp.open();

        const monsterSummary =
            harvestResults.map(
                (result) => {
                    const matchedIngredients =
                        result
                            .ingredientMatches
                            .filter(
                                (entry) =>
                                    entry.matched
                            )
                            .length;

                    const ambiguousIngredients =
                        result
                            .ingredientMatches
                            .filter(
                                (entry) =>
                                    entry.ambiguous
                            )
                            .length;

                    const unmatchedIngredients =
                        result
                            .ingredientMatches
                            .filter(
                                (entry) =>
                                    entry.status ===
                                    "unmatched"
                            )
                            .length;

                    return {
                        tokenId:
                            result
                                .tokenDocument
                                ?.id ??
                            null,

                        token:
                            result
                                .tokenDocument
                                ?.name ??
                            null,

                        compendiumActor:
                            result
                                .monsterActor
                                ?.name ??
                            null,

                        rarity:
                            result
                                .harvestData
                                ?.rarity ??
                            null,

                        components:
                            result
                                .harvestData
                                ?.components
                                ?.length ??
                            0,

                        matchedIngredients,

                        ambiguousIngredients,

                        unmatchedIngredients
                    };
                }
            );

        Logger.debug(
            "Harvest scan summary:",
            monsterSummary
        );

        console.table(
            monsterSummary
        );

        const componentSummary =
            harvestResults.flatMap(
                (result) =>
                    result
                        .ingredientMatches
                        .map(
                            (entry) => ({
                                monster:
                                    result
                                        .monsterActor
                                        ?.name ??
                                    null,

                                category:
                                    entry
                                        .component
                                        ?.category ??
                                    null,

                                component:
                                    entry
                                        .component
                                        ?.name ??
                                    null,

                                rarity:
                                    entry.rarity,

                                status:
                                    entry.status,

                                matchedItem:
                                    entry.item
                                        ?.name ??
                                    null,

                                score:
                                    entry.item
                                        ?.score ??
                                    entry
                                        .candidates
                                        ?.[0]
                                        ?.score ??
                                    null,

                                uuid:
                                    entry.item
                                        ?.uuid ??
                                    null
                            })
                        )
            );

        Logger.debug(
            "Ingredient matching results:",
            componentSummary
        );

        console.table(
            componentSummary
        );

        const sessionSummary =
            currentHarvestSession
                .getSummary();

        Logger.log(
            `Created harvest session "${currentHarvestSession.id}" with ${sessionSummary.creatures} creature(s) and ${sessionSummary.available} available component(s).`
        );

        Logger.debug(
            "Harvest session data:",
            currentHarvestSession
                .toObject()
        );

        ui.notifications.info(
            `Harvest session created with ${sessionSummary.creatures} creature${sessionSummary.creatures === 1
                ? ""
                : "s"
            } and ${sessionSummary.available} available component${sessionSummary.available === 1
                ? ""
                : "s"
            }.`
        );

        return currentHarvestSession;
    } catch (error) {
        Logger.error(
            "Failed to scan and inspect dead creatures.",
            error
        );

        ui.notifications.error(
            `${MODULE_TITLE} could not scan the current scene.`
        );

        return null;
    }
}


/**
 * Validate required modules.
 */
function validateDependencies() {
    const requiredModules = [
        {
            id:
                "drakkenheim-monsters",

            title:
                "Monsters of Drakkenheim"
        },
        {
            id:
                "antics-and-rolls-drakkenheim-mastercraft",

            title:
                "Antics & Rolls: Drakkenheim Mastercraft"
        }
    ];

    const missingModules =
        requiredModules.filter(
            ({ id }) =>
                !game.modules.get(id)
                    ?.active
        );

    if (
        missingModules.length === 0
    ) {
        Logger.debug(
            "All required modules are active."
        );

        return;
    }

    const names =
        missingModules
            .map(
                ({ title }) =>
                    title
            )
            .join(", ");

    Logger.warn(
        `Required modules are inactive: ${names}`
    );

    if (game.user.isGM) {
        ui.notifications.error(
            `${MODULE_TITLE}: required module${missingModules.length === 1
                ? " is"
                : "s are"
            } inactive: ${names}`
        );
    }
}