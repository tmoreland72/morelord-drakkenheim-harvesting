import {
    MODULE_ID
} from "../constants.js";

import {
    Logger
} from "../logger.js";

import {
    HarvestSession
} from "../models/harvest-session.js";


/**
 * Synchronizes the harvest session between connected clients.
 *
 * The active GM is authoritative:
 * - Players submit claim and release requests.
 * - The GM validates those requests.
 * - The GM broadcasts the resulting session state.
 */
export class HarvestSocketService {
    static SOCKET_NAME =
        `module.${MODULE_ID}`;

    static MESSAGE_TYPES =
        Object.freeze({
            REQUEST_SESSION:
                "request-session",

            SESSION_STATE:
                "session-state",

            CLAIM_REQUEST:
                "claim-request",

            RELEASE_REQUEST:
                "release-request",

            CLAIM_RESPONSE:
                "claim-response",

            SESSION_CLEARED:
                "session-cleared"
        });

    static #initialized =
        false;

    static #getSession =
        null;

    static #setSession =
        null;

    static #onSessionChanged =
        null;

    static #pendingRequests =
        new Map();

    /**
     * Register the socket listener.
     *
     * @param {object} options
     * @param {Function} options.getSession
     * @param {Function} options.setSession
     * @param {Function|null} options.onSessionChanged
     */
    static initialize({
        getSession,
        setSession,
        onSessionChanged = null
    }) {
        if (this.#initialized) {
            return;
        }

        if (
            typeof getSession !==
                "function" ||
            typeof setSession !==
                "function"
        ) {
            Logger.error(
                "HarvestSocketService requires getSession and setSession callbacks."
            );

            return;
        }

        this.#getSession =
            getSession;

        this.#setSession =
            setSession;

        this.#onSessionChanged =
            onSessionChanged;

        game.socket.on(
            this.SOCKET_NAME,
            (message) => {
                void this.#handleMessage(
                    message
                );
            }
        );

        this.#initialized =
            true;

        Logger.log(
            `Registered socket channel "${this.SOCKET_NAME}".`
        );
    }

    /**
     * Return the first active GM.
     *
     * @returns {User|null}
     */
    static getActiveGM() {
        return (
            game.users.find(
                (user) =>
                    user.active &&
                    user.isGM
            ) ?? null
        );
    }

    /**
     * Determine whether this client is the authoritative GM.
     *
     * When multiple GMs are connected, only the first active GM
     * handles requests to avoid duplicate processing.
     *
     * @returns {boolean}
     */
    static isAuthoritativeGM() {
        const activeGM =
            this.getActiveGM();

        return Boolean(
            activeGM &&
            activeGM.id ===
                game.user.id
        );
    }

    /**
     * Create a unique request ID.
     *
     * @returns {string}
     */
    static createRequestId() {
        return foundry.utils.randomID(
            20
        );
    }

    /**
     * Broadcast a socket message.
     *
     * @param {object} message
     */
    static emit(message) {
        game.socket.emit(
            this.SOCKET_NAME,
            {
                ...message,

                senderId:
                    game.user.id,

                sentAt:
                    Date.now()
            }
        );
    }

    /**
     * Broadcast the current session to all clients.
     *
     * Only the authoritative GM may publish session state.
     *
     * @param {HarvestSession|null} session
     */
    static broadcastSession(session) {
        if (
            !this.isAuthoritativeGM()
        ) {
            Logger.warn(
                "A non-authoritative client attempted to broadcast the harvest session."
            );

            return;
        }

        if (!session) {
            this.broadcastSessionCleared();
            return;
        }

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .SESSION_STATE,

            session:
                session.toObject()
        });

        Logger.debug(
            `Broadcast harvest session "${session.id}".`
        );
    }

    /**
     * Tell all clients that the current session has been cleared.
     */
    static broadcastSessionCleared() {
        if (
            !this.isAuthoritativeGM()
        ) {
            return;
        }

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .SESSION_CLEARED
        });

        Logger.debug(
            "Broadcast that the harvest session was cleared."
        );
    }

    /**
     * Request the active session from the GM.
     */
    static requestSession() {
        if (
            this.isAuthoritativeGM()
        ) {
            return;
        }

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .REQUEST_SESSION
        });
    }

    /**
     * Submit a claim.
     *
     * The GM processes a local claim immediately. A player sends
     * the request to the authoritative GM and receives a Promise.
     *
     * @param {object} options
     * @returns {Promise<object>}
     */
    static async requestClaim({
        creatureId,
        componentId,
        actorId =
            game.user.character?.id ??
            null,

        actorName =
            game.user.character?.name ??
            null
    }) {
        if (
            this.isAuthoritativeGM()
        ) {
            return this.#processClaimRequest({
                requestId:
                    this.createRequestId(),

                senderId:
                    game.user.id,

                creatureId,
                componentId,
                actorId,
                actorName
            });
        }

        const requestId =
            this.createRequestId();

        const responsePromise =
            this.#createPendingRequest(
                requestId
            );

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .CLAIM_REQUEST,

            requestId,
            creatureId,
            componentId,
            actorId,
            actorName
        });

        return responsePromise;
    }

    /**
     * Submit a release request.
     *
     * @param {object} options
     * @returns {Promise<object>}
     */
    static async requestRelease({
        creatureId,
        componentId
    }) {
        if (
            this.isAuthoritativeGM()
        ) {
            return this.#processReleaseRequest({
                requestId:
                    this.createRequestId(),

                senderId:
                    game.user.id,

                creatureId,
                componentId
            });
        }

        const requestId =
            this.createRequestId();

        const responsePromise =
            this.#createPendingRequest(
                requestId
            );

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .RELEASE_REQUEST,

            requestId,
            creatureId,
            componentId
        });

        return responsePromise;
    }

    /**
     * Create a pending response Promise.
     *
     * @param {string} requestId
     * @returns {Promise<object>}
     */
    static #createPendingRequest(
        requestId
    ) {
        return new Promise(
            (resolve) => {
                const timeout =
                    window.setTimeout(
                        () => {
                            this.#pendingRequests
                                .delete(
                                    requestId
                                );

                            resolve({
                                success:
                                    false,

                                reason:
                                    "socket-timeout",

                                message:
                                    "The GM did not respond to the harvest request."
                            });
                        },
                        10000
                    );

                this.#pendingRequests.set(
                    requestId,
                    {
                        resolve,
                        timeout
                    }
                );
            }
        );
    }

    /**
     * Resolve a pending request.
     *
     * @param {object} message
     */
    static #resolvePendingRequest(
        message
    ) {
        const pending =
            this.#pendingRequests.get(
                message.requestId
            );

        if (!pending) {
            return;
        }

        window.clearTimeout(
            pending.timeout
        );

        this.#pendingRequests.delete(
            message.requestId
        );

        pending.resolve(
            message.result
        );
    }

    /**
     * Process an incoming socket message.
     *
     * @param {object} message
     */
    static async #handleMessage(
        message
    ) {
        if (
            !message ||
            typeof message !==
                "object"
        ) {
            return;
        }

        switch (message.type) {
            case this.MESSAGE_TYPES
                .REQUEST_SESSION:
                this.#handleSessionRequest(
                    message
                );
                break;

            case this.MESSAGE_TYPES
                .SESSION_STATE:
                this.#handleSessionState(
                    message
                );
                break;

            case this.MESSAGE_TYPES
                .CLAIM_REQUEST:
                await this
                    .#handleClaimRequest(
                        message
                    );
                break;

            case this.MESSAGE_TYPES
                .RELEASE_REQUEST:
                await this
                    .#handleReleaseRequest(
                        message
                    );
                break;

            case this.MESSAGE_TYPES
                .CLAIM_RESPONSE:
                this.#handleClaimResponse(
                    message
                );
                break;

            case this.MESSAGE_TYPES
                .SESSION_CLEARED:
                this.#handleSessionCleared(
                    message
                );
                break;

            default:
                Logger.debug(
                    "Ignored unknown harvesting socket message:",
                    message
                );
        }
    }

    /**
     * Respond to a player requesting the current session.
     *
     * @param {object} message
     */
    static #handleSessionRequest(
        message
    ) {
        if (
            !this.isAuthoritativeGM()
        ) {
            return;
        }

        const session =
            this.#getSession();

        if (!session) {
            this.emit({
                type:
                    this.MESSAGE_TYPES
                        .SESSION_CLEARED,

                recipientId:
                    message.senderId
            });

            return;
        }

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .SESSION_STATE,

            recipientId:
                message.senderId,

            session:
                session.toObject()
        });
    }

    /**
     * Receive a synchronized session snapshot.
     *
     * @param {object} message
     */
    static #handleSessionState(
        message
    ) {
        if (
            message.recipientId &&
            message.recipientId !==
                game.user.id
        ) {
            return;
        }

        /*
         * Only accept canonical session snapshots from the
         * authoritative GM.
         */
        const activeGM =
            this.getActiveGM();

        if (
            !activeGM ||
            message.senderId !==
                activeGM.id
        ) {
            Logger.warn(
                "Ignored a harvest session update that was not sent by the authoritative GM."
            );

            return;
        }

        const session =
            HarvestSession.fromObject(
                message.session
            );

        this.#setSession(
            session
        );

        this.#notifySessionChanged(
            session
        );

        Logger.debug(
            `Received synchronized harvest session "${session.id}".`
        );
    }

    /**
     * Receive a session-cleared message.
     *
     * @param {object} message
     */
    static #handleSessionCleared(
        message
    ) {
        if (
            message.recipientId &&
            message.recipientId !==
                game.user.id
        ) {
            return;
        }

        const activeGM =
            this.getActiveGM();

        if (
            !activeGM ||
            message.senderId !==
                activeGM.id
        ) {
            return;
        }

        this.#setSession(
            null
        );

        this.#notifySessionChanged(
            null
        );

        Logger.debug(
            "Received synchronized harvest-session clear."
        );
    }

    /**
     * Handle an incoming player claim request.
     *
     * @param {object} message
     */
    static async #handleClaimRequest(
        message
    ) {
        if (
            !this.isAuthoritativeGM()
        ) {
            return;
        }

        await this.#processClaimRequest(
            message
        );
    }

    /**
     * Validate and process a claim on the authoritative GM.
     *
     * @param {object} message
     * @returns {Promise<object>}
     */
    static async #processClaimRequest(
        message
    ) {
        const session =
            this.#getSession();

        if (!session) {
            const result = {
                success:
                    false,

                reason:
                    "no-session",

                message:
                    "There is no active harvest session."
            };

            this.#sendResponse(
                message,
                result
            );

            return result;
        }

        const user =
            game.users.get(
                message.senderId
            );

        if (!user) {
            const result = {
                success:
                    false,

                reason:
                    "unknown-user",

                message:
                    "The requesting user could not be found."
            };

            this.#sendResponse(
                message,
                result
            );

            return result;
        }

        const controlledActor =
            this.#resolveClaimActor({
                user,
                actorId:
                    message.actorId
            });

        const result =
            session.claimComponent({
                creatureId:
                    message.creatureId,

                componentId:
                    message.componentId,

                userId:
                    user.id,

                userName:
                    user.name,

                actorId:
                    controlledActor?.id ??
                    null,

                actorName:
                    controlledActor?.name ??
                    message.actorName ??
                    null
            });

        this.#sendResponse(
            message,
            result
        );

        if (result.success) {
            this.broadcastSession(
                session
            );

            this.#notifySessionChanged(
                session
            );
        }

        return result;
    }

    /**
     * Handle an incoming release request.
     *
     * @param {object} message
     */
    static async #handleReleaseRequest(
        message
    ) {
        if (
            !this.isAuthoritativeGM()
        ) {
            return;
        }

        await this
            .#processReleaseRequest(
                message
            );
    }

    /**
     * Process a component release on the GM.
     *
     * @param {object} message
     * @returns {Promise<object>}
     */
    static async #processReleaseRequest(
        message
    ) {
        const session =
            this.#getSession();

        if (!session) {
            const result = {
                success:
                    false,

                reason:
                    "no-session",

                message:
                    "There is no active harvest session."
            };

            this.#sendResponse(
                message,
                result
            );

            return result;
        }

        const user =
            game.users.get(
                message.senderId
            );

        if (!user) {
            const result = {
                success:
                    false,

                reason:
                    "unknown-user",

                message:
                    "The requesting user could not be found."
            };

            this.#sendResponse(
                message,
                result
            );

            return result;
        }

        const result =
            session.releaseComponent({
                creatureId:
                    message.creatureId,

                componentId:
                    message.componentId,

                userId:
                    user.id,

                isGM:
                    user.isGM
            });

        this.#sendResponse(
            message,
            result
        );

        if (result.success) {
            this.broadcastSession(
                session
            );

            this.#notifySessionChanged(
                session
            );
        }

        return result;
    }

    /**
     * Send a request result to its originating client.
     *
     * @param {object} request
     * @param {object} result
     */
    static #sendResponse(
        request,
        result
    ) {
        /*
         * A local GM request does not need a socket response.
         */
        if (
            request.senderId ===
                game.user.id
        ) {
            return;
        }

        this.emit({
            type:
                this.MESSAGE_TYPES
                    .CLAIM_RESPONSE,

            recipientId:
                request.senderId,

            requestId:
                request.requestId,

            result:
                this.#serializeResult(
                    result
                )
        });
    }

    /**
     * Receive the result of a claim or release request.
     *
     * @param {object} message
     */
    static #handleClaimResponse(
        message
    ) {
        if (
            message.recipientId !==
                game.user.id
        ) {
            return;
        }

        this.#resolvePendingRequest(
            message
        );
    }

    /**
     * Resolve the Actor associated with the request.
     *
     * Players may use their assigned character or an Actor they own.
     *
     * @param {object} options
     * @param {User} options.user
     * @param {string|null} options.actorId
     * @returns {Actor|null}
     */
    static #resolveClaimActor({
        user,
        actorId
    }) {
        const assignedCharacter =
            user.character;

        if (
            assignedCharacter &&
            (
                !actorId ||
                assignedCharacter.id ===
                    actorId
            )
        ) {
            return assignedCharacter;
        }

        const requestedActor =
            actorId
                ? game.actors.get(
                    actorId
                )
                : null;

        if (
            requestedActor &&
            requestedActor.testUserPermission(
                user,
                CONST.DOCUMENT_OWNERSHIP_LEVELS
                    .OWNER
            )
        ) {
            return requestedActor;
        }

        return assignedCharacter ??
            null;
    }

    /**
     * Remove document references from a socket response.
     *
     * @param {object} result
     * @returns {object}
     */
    static #serializeResult(result) {
        return {
            success:
                Boolean(
                    result?.success
                ),

            reason:
                result?.reason ??
                null,

            message:
                result?.message ??
                ""
        };
    }

    /**
     * Notify the application layer of session changes.
     *
     * @param {HarvestSession|null} session
     */
    static #notifySessionChanged(
        session
    ) {
        if (
            typeof this
                .#onSessionChanged ===
                "function"
        ) {
            this.#onSessionChanged(
                session
            );
        }

        Hooks.callAll(
            `${MODULE_ID}.sessionChanged`,
            session
        );
    }
}