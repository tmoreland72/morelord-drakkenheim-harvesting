import { Logger } from "../logger.js";

export const CORE_MODULE_ID = "morelord-core";
export const PRODUCT_ID = "morelord-drakkenheim-harvesting";
export const PLAYER_CLAIMS_FEATURE = "drakkenheim-harvesting.player-claims";

export class EntitlementService {
    static get core() {
        return game.modules.get(CORE_MODULE_ID)?.api ?? null;
    }

    static async hasCollaborativeClaims() {
        const core = this.core;

        if (!core) {
            Logger.warn("Morelord Core API was not available. Using GM-managed harvesting.");
            return false;
        }

        try {
            await core.refresh?.(PRODUCT_ID);
        } catch (error) {
            Logger.warn("Could not refresh harvesting entitlements. Using cached access when available.", error);
        }

        try {
            return Boolean(core.hasFeature?.(PLAYER_CLAIMS_FEATURE, PRODUCT_ID));
        } catch (error) {
            Logger.warn("Could not read collaborative harvesting entitlement.", error);
            return false;
        }
    }
}
