import {
    MODULE_ID,
    MODULE_TITLE
} from "../constants.js";

import {
    Logger
} from "../logger.js";


const {
    ApplicationV2,
    HandlebarsApplicationMixin
} = foundry.applications.api;


/**
 * Shared player-facing harvesting application.
 */
export class HarvestApp extends
    HandlebarsApplicationMixin(
        ApplicationV2
    ) {

    static #instance = null;


    static DEFAULT_OPTIONS = {
        id:
            `${MODULE_ID}-app`,

        classes: [
            MODULE_ID,
            "morelord-harvest-app"
        ],

        tag:
            "div",

        position: {
            width:
                820,

            height:
                720
        },

        window: {
            title:
                MODULE_TITLE,

            icon:
                "fa-solid fa-scalpel",

            resizable:
                true
        },

        actions: {
            claim: this.#onClaim,

            release: this.#onRelease,

            refresh: this.#onRefresh,

            toggleCreature: this.#onToggleCreature,

            finalize: this.#onFinalize
        },


    };


    static PARTS = {
        main: {
            template:
                `modules/${MODULE_ID}/templates/harvest-app.hbs`
        }
    };


    /**
     * Creature IDs which the current user has collapsed.
     */
    #collapsedCreatures =
        new Set();


    /**
     * Saved scroll position used while the app rerenders.
     */
    #savedScrollTop = 0;


    /**
     * Character selected by the GM for GM-managed claims.
     */
    #selectedActorId = null;


    /**
     * Return the currently managed application instance.
     *
     * @returns {HarvestApp}
     */
    static getInstance() {
        if (!this.#instance) {
            this.#instance =
                new HarvestApp();
        }

        return this.#instance;
    }


    /**
     * Open or refresh the harvesting window.
     *
     * @returns {Promise<HarvestApp>}
     */
    static async open() {
        const app =
            this.getInstance();

        if (app.rendered) {
            app.#rememberScrollPosition();
        }

        await app.render({
            force: true
        });

        return app;
    }


    /**
     * Refresh the harvesting window if currently open.
     */
    static refresh() {
        const app =
            this.#instance;

        if (!app?.rendered) {
            return;
        }

        app.#rememberScrollPosition();

        void app.render();
    }


    /**
     * Close the harvesting window.
     */
    static async closeOpen() {
        if (!this.#instance) {
            return;
        }

        if (this.#instance.rendered) {
            await this.#instance.close();
        }

        this.#instance =
            null;
    }


    /**
     * Return the module API.
     *
     * @returns {object|null}
     */
    get api() {
        return (
            game.modules.get(
                MODULE_ID
            )?.api ??
            null
        );
    }


    /**
     * Save the current creature-list scroll position.
     */
    #rememberScrollPosition() {
        const scrollElement =
            this.element?.querySelector(
                ".mlh-creatures"
            );

        if (!scrollElement) {
            return;
        }

        this.#savedScrollTop =
            scrollElement.scrollTop;
    }


    /**
     * Restore scroll position after rendering.
     *
     * @param {object} context
     * @param {object} options
     */
    _onRender(context, options) {
        super._onRender(
            context,
            options
        );

        const scrollElement =
            this.element?.querySelector(
                ".mlh-creatures"
            );

        if (scrollElement) {
            scrollElement.scrollTop =
                this.#savedScrollTop;
        }

        const actorSelect =
            this.element?.querySelector(
                "[data-role='claim-actor']"
            );

        if (actorSelect) {
            actorSelect.addEventListener(
                "change",
                (event) => {
                    this.#selectedActorId =
                        event.currentTarget.value ||
                        null;

                    void this.render();
                }
            );
        }
    }


    /**
     * Prepare application context.
     *
     * @param {object} options
     * @returns {Promise<object>}
     */
    async _prepareContext(options) {
        const context =
            await super._prepareContext(
                options
            );

        const api =
            this.api;

        const session =
            api?.getHarvestSession?.() ??
            null;

        if (!session) {
            return {
                ...context,

                hasSession:
                    false,

                session:
                    null,

                creatures:
                    [],

                user:
                    this.#getUserContext(),

                isGM:
                    game.user.isGM
            };
        }

        const userContext =
            this.#getUserContext();

        const isGmManaged =
            session.mode === "gm-managed";

        const claimActors =
            isGmManaged && game.user.isGM
                ? this.#getClaimActors()
                : [];

        if (
            isGmManaged &&
            !claimActors.some(
                (actor) => actor.id === this.#selectedActorId
            )
        ) {
            this.#selectedActorId =
                claimActors[0]?.id ??
                null;
        }

        const selectedActor =
            this.#selectedActorId
                ? game.actors.get(this.#selectedActorId)
                : null;

        const claimContext = {
            ...userContext,
            identityId:
                isGmManaged
                    ? selectedActor?.id ?? null
                    : userContext.id,
            identityType:
                isGmManaged
                    ? "actor"
                    : "user"
        };

        const creatures =
            session.creatures.map(
                (creature) =>
                    this.#prepareCreature(
                        creature,
                        claimContext
                    )
            );

        const summary =
            session.getSummary();

        return {
            ...context,

            hasSession:
                true,

            session: {
                id:
                    session.id,

                sceneId:
                    session.sceneId,

                sceneName:
                    session.sceneName,

                createdAt:
                    session.createdAt,

                updatedAt:
                    session.updatedAt,

                mode:
                    session.mode
            },

            summary,

            creatures,

            user: userContext,

            isGM: game.user.isGM,

            isCollaborative:
                session.mode === "collaborative",

            isGmManaged,

            claimActors:
                claimActors.map((actor) => ({
                    id: actor.id,
                    name: actor.name,
                    img: actor.img,
                    selected: actor.id === this.#selectedActorId
                })),

            selectedActorName:
                selectedActor?.name ??
                null,

            hasClaims: summary.claimed > 0,

            isFinalized: summary.finalized,

            canFinalize:
                game.user.isGM &&
                summary.claimed > 0 &&
                !summary.finalized
        };
    }


    /**
     * Prepare current user information.
     *
     * @returns {object}
     */
    #getUserContext() {
        const character =
            game.user.character;

        return {
            id:
                game.user.id,

            name:
                game.user.name,

            isGM:
                game.user.isGM,

            characterId:
                character?.id ??
                null,

            characterName:
                character?.name ??
                null,

            characterImg:
                character?.img ??
                null
        };
    }


    /**
     * Return eligible character Actors for GM-managed harvesting.
     *
     * @returns {Actor[]}
     */
    #getClaimActors() {
        return game.actors
            .filter((actor) => actor.type === "character")
            .sort((a, b) => a.name.localeCompare(b.name));
    }


    /**
     * Prepare one creature for rendering.
     *
     * @param {object} creature
     * @param {object} userContext
     * @returns {object}
     */
    #prepareCreature(
        creature,
        userContext
    ) {
        const userClaim =
            creature.components.find(
                (component) =>
                    (
                        userContext.identityType === "actor"
                            ? component.claimedBy?.actorId === userContext.identityId
                            : component.claimedBy?.userId === userContext.identityId
                    )
            ) ??
            null;

        const components =
            creature.components.map(
                (component) =>
                    this.#prepareComponent({
                        creature,
                        component,
                        userContext,
                        userClaim
                    })
            );

        const claimedCount =
            components.filter(
                (component) =>
                    component.isClaimed
            ).length;

        const availableCount =
            components.filter(
                (component) =>
                    component.isAvailable
            ).length;

        const isCollapsed =
            this.#collapsedCreatures.has(
                creature.id
            );

        return {
            ...creature,

            userHasClaim:
                Boolean(userClaim),

            userClaimId:
                userClaim?.id ??
                null,

            claimedCount,

            availableCount,

            isCollapsed,

            components
        };
    }


    /**
     * Prepare one component for rendering.
     *
     * @param {object} options
     * @returns {object}
     */
    #prepareComponent({
        creature,
        component,
        userContext,
        userClaim
    }) {
        const isClaimed =
            Boolean(
                component.claimedBy
            );

        const claimedByCurrentUser =
            userContext.identityType === "actor"
                ? component.claimedBy?.actorId === userContext.identityId
                : component.claimedBy?.userId === userContext.identityId;

        const claimedByOther =
            isClaimed &&
            !claimedByCurrentUser;

        const hasIngredient =
            Boolean(
                component.matched &&
                component.ingredient?.uuid
            );

        const userAlreadyClaimedOther =
            Boolean(
                userClaim &&
                userClaim.id !==
                component.id
            );

        const canClaim =
            hasIngredient &&
            !isClaimed &&
            !userAlreadyClaimedOther;

        const canRelease =
            claimedByCurrentUser ||
            (
                game.user.isGM &&
                isClaimed
            );

        let state =
            "available";

        if (!hasIngredient) {
            state =
                "unavailable";
        } else if (
            claimedByCurrentUser
        ) {
            state =
                "mine";
        } else if (
            claimedByOther
        ) {
            state =
                "claimed";
        } else if (
            userAlreadyClaimedOther
        ) {
            state =
                "locked";
        }

        return {
            ...component,

            creatureId:
                creature.id,

            isClaimed,

            isAvailable:
                canClaim,

            claimedByCurrentUser,

            claimedByOther,

            hasIngredient,

            userAlreadyClaimedOther,

            canClaim,

            canRelease,

            state,

            claimantName:
                component.claimedBy
                    ?.actorName ??
                component.claimedBy
                    ?.userName ??
                null
        };
    }


    /**
     * Toggle a creature open or closed.
     *
     * @this {HarvestApp}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onToggleCreature(
        event,
        target
    ) {
        event.preventDefault();

        const creatureId =
            target.dataset.creatureId;

        if (!creatureId) {
            return;
        }

        this.#rememberScrollPosition();

        if (
            this.#collapsedCreatures.has(
                creatureId
            )
        ) {
            this.#collapsedCreatures.delete(
                creatureId
            );
        } else {
            this.#collapsedCreatures.add(
                creatureId
            );
        }

        await this.render();
    }


    /**
     * Handle a component claim.
     *
     * @this {HarvestApp}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onClaim(
        event,
        target
    ) {
        event.preventDefault();

        const creatureId =
            target.dataset.creatureId;

        const componentId =
            target.dataset.componentId;

        if (
            !creatureId ||
            !componentId
        ) {
            Logger.warn(
                "Harvest claim action was missing creature or component ID."
            );

            return;
        }

        target.disabled =
            true;

        this.#rememberScrollPosition();

        try {
            const api =
                game.modules.get(
                    MODULE_ID
                )?.api;

            if (!api) {
                return;
            }

            const session =
                api.getHarvestSession?.();

            const selectedActor =
                session?.mode === "gm-managed"
                    ? game.actors.get(this.#selectedActorId)
                    : null;

            if (
                session?.mode === "gm-managed" &&
                !selectedActor
            ) {
                ui.notifications.warn(
                    "Select a character before claiming a component."
                );

                return;
            }

            const result =
                await api.claimComponent({
                    creatureId,
                    componentId,
                    actorId:
                        selectedActor?.id ??
                        game.user.character?.id ??
                        null,
                    actorName:
                        selectedActor?.name ??
                        game.user.character?.name ??
                        null
                });

            if (
                result?.success &&
                session?.mode === "collaborative"
            ) {
                /*
                 * Collaborative users are finished with this creature
                 * after choosing their one component. In GM-managed
                 * mode the creature remains open so the GM can assign
                 * components to additional characters.
                 */
                this.#collapsedCreatures.add(
                    creatureId
                );
            }

            await this.render();
        } finally {
            if (
                target.isConnected
            ) {
                target.disabled =
                    false;
            }
        }
    }


    /**
     * Handle release of a component.
     *
     * @this {HarvestApp}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onRelease(
        event,
        target
    ) {
        event.preventDefault();

        const creatureId =
            target.dataset.creatureId;

        const componentId =
            target.dataset.componentId;

        if (
            !creatureId ||
            !componentId
        ) {
            Logger.warn(
                "Harvest release action was missing creature or component ID."
            );

            return;
        }

        target.disabled =
            true;

        this.#rememberScrollPosition();

        try {
            const api =
                game.modules.get(
                    MODULE_ID
                )?.api;

            if (!api) {
                return;
            }

            const result =
                await api.releaseComponent({
                    creatureId,
                    componentId
                });

            if (result?.success) {
                /*
                 * Re-open the creature when the user's selection
                 * is released so another choice can be made.
                 */
                this.#collapsedCreatures.delete(
                    creatureId
                );
            }

            await this.render();
        } finally {
            if (
                target.isConnected
            ) {
                target.disabled =
                    false;
            }
        }
    }


    /**
     * Request current state from the GM.
     *
     * @this {HarvestApp}
     * @param {PointerEvent} event
     */
    static async #onRefresh(
        event
    ) {
        event.preventDefault();

        this.#rememberScrollPosition();

        const api =
            game.modules.get(
                MODULE_ID
            )?.api;

        if (!api) {
            return;
        }

        if (!game.user.isGM) {
            api.requestHarvestSession();

            await new Promise(
                (resolve) =>
                    window.setTimeout(
                        resolve,
                        250
                    )
            );
        }

        await this.render();
    }

    /**
 * Finalize the harvest and award all claimed Items.
 *
 * @this {HarvestApp}
 * @param {PointerEvent} event
 * @param {HTMLElement} target
 */
    static async #onFinalize(
        event,
        target
    ) {
        event.preventDefault();

        if (!game.user.isGM) {
            return;
        }

        const confirmed =
            window.confirm(
                "Finalize this harvest and award all currently claimed components to the characters?"
            );

        if (!confirmed) {
            return;
        }

        target.disabled =
            true;

        this.#rememberScrollPosition();

        try {
            const api =
                game.modules.get(
                    MODULE_ID
                )?.api;

            if (!api) {
                return;
            }

            const result =
                await api.finalizeHarvest();

            /*
             * Successful finalization closes this application.
             * Rendering afterward would immediately reopen it.
             */
            if (!result?.success) {
                await this.render();
            }
        } finally {
            if (
                target.isConnected
            ) {
                target.disabled =
                    false;
            }
        }
    }
}