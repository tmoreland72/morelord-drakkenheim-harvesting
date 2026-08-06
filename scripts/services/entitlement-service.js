import { Logger } from "../logger.js";

export const CORE_MODULE_ID = "morelord-core";
export const PRODUCT_ID = "morelord-drakkenheim-harvesting";
export const PLAYER_CLAIMS_FEATURE = "drakkenheim-harvesting.player-claims";
export const PREMIUM_MEMBERSHIP_FEATURE = "premium-modules";
export const CHAMPION_MEMBERSHIP_FEATURE = "champion-access";

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

        let productAccess = null;

        try {
            productAccess = await core.refresh?.(PRODUCT_ID);
        } catch (error) {
            Logger.warn("Could not refresh harvesting entitlements. Using cached access when available.", error);
        }

        try {
            if (core.hasFeature?.(PLAYER_CLAIMS_FEATURE, PRODUCT_ID)) {
                Logger.debug("Collaborative harvesting enabled by product feature entitlement.");
                return true;
            }

            /*
             * Product features are the preferred authorization source. The
             * tier fallback keeps premium access working if an older website
             * record or cached entitlement response is missing the product
             * feature key while still correctly reporting the paid tier.
             */
            const productTier =
                productAccess?.tier ??
                core.getTier?.(PRODUCT_ID) ??
                "standard";

            if (["premium", "champion"].includes(productTier)) {
                Logger.warn(
                    `Collaborative harvesting feature key was missing, but the product tier is ${productTier}. Allowing collaborative harvesting.`
                );
                return true;
            }

            /*
             * Morelord Core may already have the broad Stripe membership
             * entitlements cached before this product is refreshed. This is
             * a final compatibility fallback for paid members.
             */
            if (
                core.hasFeature?.(PREMIUM_MEMBERSHIP_FEATURE, CORE_MODULE_ID) ||
                core.hasFeature?.(CHAMPION_MEMBERSHIP_FEATURE, CORE_MODULE_ID)
            ) {
                Logger.warn(
                    "Collaborative harvesting product access was unavailable, but a paid Morelord membership entitlement is active. Allowing collaborative harvesting."
                );
                return true;
            }

            Logger.debug("Collaborative harvesting is not available for this account.", {
                productId: PRODUCT_ID,
                productTier,
                productAccess
            });

            return false;
        } catch (error) {
            Logger.warn("Could not read collaborative harvesting entitlement.", error);
            return false;
        }
    }
}
