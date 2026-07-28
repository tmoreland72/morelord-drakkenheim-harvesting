import { PACKS } from "../constants.js";
import { Logger } from "../logger.js";

/**
 * Loads and matches Antics & Rolls harvesting ingredient items.
 */
export class IngredientService {
    static #ingredientPack = null;
    static #ingredientIndex = null;

    static getIngredientPack() {
        if (this.#ingredientPack) {
            return this.#ingredientPack;
        }

        const pack = game.packs.get(
            PACKS.ingredients
        );

        if (!pack) {
            Logger.error(
                `Ingredient compendium "${PACKS.ingredients}" could not be found.`
            );

            return null;
        }

        this.#ingredientPack = pack;

        return pack;
    }

    static async getIngredientIndex({
        force = false
    } = {}) {
        if (
            this.#ingredientIndex &&
            !force
        ) {
            return this.#ingredientIndex;
        }

        const pack =
            this.getIngredientPack();

        if (!pack) {
            return null;
        }

        try {
            this.#ingredientIndex =
                await pack.getIndex({
                    fields: [
                        "name",
                        "img",
                        "type",
                        "system.rarity"
                    ]
                });

            Logger.log(
                `Indexed ${this.#ingredientIndex.size} Antics & Rolls ingredients.`
            );

            return this.#ingredientIndex;
        } catch (error) {
            Logger.error(
                "Failed to load the Antics & Rolls ingredient index.",
                error
            );

            return null;
        }
    }

    static getRarityKey(rarity) {
        const normalized =
            String(rarity ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

        const rarityKeys = {
            common:
                "common",
            uncommon:
                "uncommon",
            rare:
                "rare",
            "very rare":
                "veryRare",
            legendary:
                "legendary",
            artifact:
                "artifact"
        };

        return (
            rarityKeys[normalized] ??
            null
        );
    }

    static normalizeText(value) {
        return String(value ?? "")
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[’']/g, "")
            .replace(
                /\([^)]*\)/g,
                " "
            )
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();
    }

    static normalizeToken(token) {
        let normalized =
            this.normalizeText(token);

        const aliases = {
            aberrant:
                "aberration",
            draconic:
                "dragon",
            fiendish:
                "fiend"
        };

        if (aliases[normalized]) {
            return aliases[normalized];
        }

        if (
            normalized.endsWith("ies") &&
            normalized.length > 3
        ) {
            normalized =
                `${normalized.slice(
                    0,
                    -3
                )}y`;
        } else if (
            normalized.endsWith("s") &&
            !normalized.endsWith(
                "ss"
            ) &&
            normalized.length > 3
        ) {
            normalized =
                normalized.slice(
                    0,
                    -1
                );
        }

        return (
            aliases[normalized] ??
            normalized
        );
    }

    static tokenize(value) {
        return this.normalizeText(value)
            .split(" ")
            .map(
                (token) =>
                    this.normalizeToken(
                        token
                    )
            )
            .filter(Boolean);
    }

    static getCategoryAliases(category) {
        const normalizedCategory =
            this.normalizeText(
                category
            );

        const aliases = {
            animus: [
                "animus"
            ],
            fluid: [
                "fluid"
            ],
            organs: [
                "organ",
                "organs"
            ],
            bones: [
                "bone",
                "bones"
            ],
            "natural weapons": [
                "natural weapon",
                "natural weapons"
            ],
            hair: [
                "hair"
            ],
            hide: [
                "hide"
            ],
            dust: [
                "dust"
            ]
        };

        return (
            aliases[
            normalizedCategory
            ] ?? [
                normalizedCategory
            ]
        );
    }

    static getIgnoredMonsterNameTokens() {
        return new Set([
            "a",
            "an",
            "the",
            "of",
            "from",
            "delerium",
            "delirium",
            "wyrmling",
            "young",
            "adult",
            "ancient"
        ]);
    }

    static getMonsterSourceTerms(
        monsterActor
    ) {
        const terms = [];
        const seen = new Set();

        const addTerm = (
            value,
            priority,
            source
        ) => {
            const normalized =
                this.normalizeText(
                    value
                );

            if (
                !normalized ||
                seen.has(normalized)
            ) {
                return;
            }

            seen.add(normalized);

            terms.push({
                term:
                    normalized,
                priority,
                source
            });
        };

        const actorName =
            this.normalizeText(
                monsterActor?.name
            );

        addTerm(
            actorName,
            40,
            "full actor name"
        );

        const simplifiedName =
            actorName
                .replace(
                    /\b(wyrmling|young|adult|ancient)\b/g,
                    " "
                )
                .replace(/\s+/g, " ")
                .trim();

        if (
            simplifiedName &&
            simplifiedName !==
            actorName
        ) {
            addTerm(
                simplifiedName,
                38,
                "simplified actor name"
            );
        }

        const ignoredTokens =
            this
                .getIgnoredMonsterNameTokens();

        for (
            const token of
            this.tokenize(actorName)
        ) {
            if (
                token.length < 4 ||
                ignoredTokens.has(
                    token
                )
            ) {
                continue;
            }

            addTerm(
                token,
                30,
                "actor name token"
            );
        }

        const creatureType =
            foundry.utils.getProperty(
                monsterActor,
                "system.details.type.value"
            );

        const creatureSubtype =
            foundry.utils.getProperty(
                monsterActor,
                "system.details.type.subtype"
            );

        const customType =
            foundry.utils.getProperty(
                monsterActor,
                "system.details.type.custom"
            );

        addTerm(
            creatureType,
            28,
            "creature type"
        );

        addTerm(
            creatureSubtype,
            24,
            "creature subtype"
        );

        addTerm(
            customType,
            24,
            "custom creature type"
        );

        return terms.sort(
            (termA, termB) =>
                termB.priority -
                termA.priority
        );
    }

    static getGenericIdentityTokens() {
        return new Set([
            "animus",
            "bone",
            "dust",
            "fluid",
            "hair",
            "hide",
            "natural",
            "organ",
            "weapon"
        ]);
    }

    static getComponentSourceTerms(
        component
    ) {
        const categoryTokens =
            new Set(
                this.tokenize(
                    component?.category
                )
            );

        const genericIdentityTokens =
            this
                .getGenericIdentityTokens();

        const physicalComponentTokens =
            new Set([
                "bile",
                "blood",
                "brain",
                "claw",
                "eye",
                "flesh",
                "flower",
                "gland",
                "gut",
                "heart",
                "ichor",
                "leaf",
                "leaves",
                "membrane",
                "rib",
                "sap",
                "scale",
                "skin",
                "skull",
                "spine",
                "spore",
                "stem",
                "teeth",
                "tooth"
            ]);

        return [
            ...new Set(
                this.tokenize(
                    component?.name
                ).filter((token) => {
                    return (
                        !categoryTokens.has(
                            token
                        ) &&
                        !genericIdentityTokens.has(
                            token
                        ) &&
                        !physicalComponentTokens.has(
                            token
                        ) &&
                        token !==
                        "monster" &&
                        token !==
                        "contaminated" &&
                        token !==
                        "goopy" &&
                        token !==
                        "acidic"
                    );
                })
            )
        ];
    }

    static getComponentIdentityTokens(
        component
    ) {
        const componentTokens =
            this.tokenize(
                component?.name
            );

        const sourceTerms =
            new Set(
                this.getComponentSourceTerms(
                    component
                )
            );

        return componentTokens.filter(
            (token) =>
                !sourceTerms.has(
                    token
                )
        );
    }

    static getTokenOverlap(
        requestedTokens,
        candidateTokens
    ) {
        if (
            requestedTokens.length === 0 ||
            candidateTokens.length === 0
        ) {
            return 0;
        }

        const candidateSet =
            new Set(
                candidateTokens
            );

        const matchingTokens =
            requestedTokens.filter(
                (token) =>
                    candidateSet.has(
                        token
                    )
            );

        return (
            matchingTokens.length /
            requestedTokens.length
        );
    }

    static getMatchedTokens(
        requestedTokens,
        candidateTokens
    ) {
        const candidateSet =
            new Set(
                candidateTokens
            );

        return requestedTokens.filter(
            (token) =>
                candidateSet.has(
                    token
                )
        );
    }

    static findMonsterSourceMatch(
        ingredientName,
        monsterActor
    ) {
        const ingredientTokens =
            new Set(
                this.tokenize(
                    ingredientName
                )
            );

        return (
            this.getMonsterSourceTerms(
                monsterActor
            ).find((entry) => {
                const sourceTokens =
                    this.tokenize(
                        entry.term
                    );

                return (
                    sourceTokens.length > 0 &&
                    sourceTokens.every(
                        (token) =>
                            ingredientTokens.has(
                                token
                            )
                    )
                );
            }) ?? null
        );
    }

    static findComponentSourceMatch(
        ingredientTokens,
        component
    ) {
        const ingredientSet =
            new Set(
                ingredientTokens
            );

        return (
            this.getComponentSourceTerms(
                component
            ).find(
                (term) =>
                    ingredientSet.has(
                        term
                    )
            ) ?? null
        );
    }

    static isGenericCategoryItem(
        ingredientName,
        categoryAliases
    ) {
        return categoryAliases.some(
            (alias) =>
                ingredientName ===
                this.normalizeText(
                    alias
                )
        );
    }

    /**
     * Allow the basic category Item as the final fallback.
     *
     * Examples:
     * Organs / Brain / Very Rare
     *   -> Organ (Very Rare)
     *
     * Bones / Stem / Common
     *   -> Bones (Common)
     *
     * Natural Weapons / Claws / Rare
     *   -> Natural Weapon (Rare)
     *
     * @returns {boolean}
     */
    static isGenericFallbackAllowed() {
        return true;
    }

    /**
     * Determine whether an ingredient has an explicit creature source.
     *
     * Examples:
     * "Organ - Heart from a Fiend"
     * "Bones - Skull from Monstrosity"
     *
     * @param {string} ingredientName
     * @returns {boolean}
     */
    static hasExplicitFromSource(
        ingredientName
    ) {
        return /\bfrom\b/i.test(
            String(ingredientName ?? "")
        );
    }

    static scoreCandidate({
        component,
        monsterActor,
        rarityKey,
        ingredient
    }) {
        const ingredientName =
            this.normalizeText(
                ingredient.name
            );

        const ingredientTokens =
            this.tokenize(
                ingredient.name
            );

        const ingredientRarity =
            ingredient.system
                ?.rarity ??
            null;

        const categoryAliases =
            this.getCategoryAliases(
                component.category
            );

        const normalizedAliases =
            categoryAliases.map(
                (alias) =>
                    this.normalizeText(
                        alias
                    )
            );

        const categoryMatched =
            normalizedAliases.some(
                (alias) => {
                    return (
                        ingredientName ===
                        alias ||
                        ingredientName
                            .startsWith(
                                `${alias} `
                            ) ||
                        ingredientName
                            .includes(
                                ` ${alias} `
                            )
                    );
                }
            );

        if (
            rarityKey &&
            ingredientRarity !==
            rarityKey
        ) {
            return {
                score:
                    0,
                valid:
                    false,
                reasons: [
                    "rarity mismatch"
                ],
                sourcePriority:
                    0,
                identityOverlap:
                    0,
                exactComponentPhrase:
                    false,
                genericFallback:
                    false
            };
        }

        if (!categoryMatched) {
            return {
                score:
                    0,
                valid:
                    false,
                reasons: [
                    "category mismatch"
                ],
                sourcePriority:
                    0,
                identityOverlap:
                    0,
                exactComponentPhrase:
                    false,
                genericFallback:
                    false
            };
        }

        const normalizedComponentName =
            this.normalizeText(
                component.name
            );

        const componentIdentityTokens =
            this.getComponentIdentityTokens(
                component
            );

        const componentSourceTerms =
            this.getComponentSourceTerms(
                component
            );

        const exactComponentPhrase =
            Boolean(
                normalizedComponentName &&
                ingredientName.includes(
                    normalizedComponentName
                )
            );

        const matchedIdentityTokens =
            this.getMatchedTokens(
                componentIdentityTokens,
                ingredientTokens
            );

        const identityOverlap =
            componentIdentityTokens
                .length > 0
                ? (
                    matchedIdentityTokens
                        .length /
                    componentIdentityTokens
                        .length
                )
                : 0;

        const componentSourceMatch =
            this.findComponentSourceMatch(
                ingredientTokens,
                component
            );

        /*
         * Source-specific components should prefer a matching source,
         * but the plain category item remains a valid final fallback.
         *
         * Examples:
         * Animus: Ooze
         *   -> Animus - Ooze
         *   -> Animus
         *
         * Animus: Fey
         *   -> Animus - Fey
         *   -> Animus
         */
        const genericCategoryItem =
            this.isGenericCategoryItem(
                ingredientName,
                normalizedAliases
            );

        if (
            componentSourceTerms.length > 0 &&
            !componentSourceMatch &&
            !genericCategoryItem
        ) {
            return {
                score: 0,
                valid: false,
                reasons: [
                    "component source mismatch"
                ],
                sourcePriority: 0,
                identityOverlap,
                exactComponentPhrase,
                genericFallback: false
            };
        }

        const genericFallback =
            genericCategoryItem &&
            this.isGenericFallbackAllowed(
                component,
                componentIdentityTokens
            );

        /*
         * A component such as "Fey", "Aberrant", "Fiendish",
         * or "Ooze" is itself a source descriptor. In that case,
         * a matching component source is sufficient even though
         * there are no remaining physical identity tokens.
         */
        const sourceOnlyComponent =
            componentSourceTerms.length > 0 &&
            componentIdentityTokens.length === 0;

        /*
        * The physical component identity must match.
        *
        * This prevents:
        * Brain -> Eye
        * Guts -> Heart
        * Stem -> generic Bones
        * Elemental Fluid -> Monster Blood
        */
        const hasIdentityMatch =
            exactComponentPhrase ||
            identityOverlap === 1 ||
            genericFallback ||
            (
                sourceOnlyComponent &&
                Boolean(componentSourceMatch)
            );

        if (!hasIdentityMatch) {
            return {
                score:
                    0,
                valid:
                    false,
                reasons: [
                    "component identity mismatch"
                ],
                sourcePriority:
                    0,
                identityOverlap,
                exactComponentPhrase,
                genericFallback
            };
        }

        let score = 0;
        let sourcePriority = 0;

        const reasons = [];

        if (rarityKey) {
            score += 40;
            reasons.push(
                "rarity"
            );
        }

        score += 30;
        reasons.push(
            "category"
        );

        if (exactComponentPhrase) {
            score += 50;
            reasons.push(
                "exact component phrase"
            );
        } else if (
            identityOverlap === 1
        ) {
            score += 40;
            reasons.push(
                "full component identity"
            );
        }

        if (componentSourceMatch) {
            score += 30;
            sourcePriority =
                Math.max(
                    sourcePriority,
                    35
                );

            reasons.push(
                `component source: ${componentSourceMatch}`
            );
        }

        const monsterSourceMatch =
            this.findMonsterSourceMatch(
                ingredientName,
                monsterActor
            );

        if (monsterSourceMatch) {
            score +=
                monsterSourceMatch.priority;

            sourcePriority =
                Math.max(
                    sourcePriority,
                    monsterSourceMatch
                        .priority
                );

            reasons.push(
                `monster source: ${monsterSourceMatch.term}`
            );
        }

        if (genericFallback) {
            score += 10;
            reasons.push(
                "generic fallback"
            );
        }

        /*
         * Never use an item explicitly sourced from the wrong
         * creature type merely because its physical component matches.
         *
         * Examples rejected:
         * Heart from a Fiend for a Monstrosity
         * Eye from a Troll for a Fiend
         * Flesh from a Dragon for a Giant
         */
        if (
            this.hasExplicitFromSource(
                ingredientName
            ) &&
            !monsterSourceMatch &&
            !componentSourceMatch
        ) {
            return {
                score: 0,
                valid: false,
                reasons: [
                    "explicit creature source mismatch"
                ],
                sourcePriority: 0,
                identityOverlap,
                exactComponentPhrase,
                genericFallback
            };
        }

        return {
            score,
            valid: true,
            reasons,
            sourcePriority,
            identityOverlap,
            exactComponentPhrase,
            genericFallback
        };
    }

    static compareCandidates(
        candidateA,
        candidateB
    ) {
        if (
            candidateB.score !==
            candidateA.score
        ) {
            return (
                candidateB.score -
                candidateA.score
            );
        }

        if (
            candidateB.sourcePriority !==
            candidateA.sourcePriority
        ) {
            return (
                candidateB.sourcePriority -
                candidateA.sourcePriority
            );
        }

        if (
            candidateA.exactComponentPhrase !==
            candidateB.exactComponentPhrase
        ) {
            return (
                candidateA
                    .exactComponentPhrase
                    ? -1
                    : 1
            );
        }

        if (
            candidateB.identityOverlap !==
            candidateA.identityOverlap
        ) {
            return (
                candidateB
                    .identityOverlap -
                candidateA
                    .identityOverlap
            );
        }

        if (
            candidateA.genericFallback !==
            candidateB.genericFallback
        ) {
            return (
                candidateA
                    .genericFallback
                    ? 1
                    : -1
            );
        }

        const nameLengthDifference =
            candidateA.name.length -
            candidateB.name.length;

        if (
            nameLengthDifference !== 0
        ) {
            return nameLengthDifference;
        }

        return candidateA.name
            .localeCompare(
                candidateB.name
            );
    }

    static areCandidatesAmbiguous(
        bestCandidate,
        secondCandidate
    ) {
        if (
            !bestCandidate ||
            !secondCandidate
        ) {
            return false;
        }

        return (
            bestCandidate.score ===
            secondCandidate.score &&
            bestCandidate.sourcePriority ===
            secondCandidate.sourcePriority &&
            bestCandidate.identityOverlap ===
            secondCandidate.identityOverlap &&
            bestCandidate.exactComponentPhrase ===
            secondCandidate.exactComponentPhrase &&
            bestCandidate.genericFallback ===
            secondCandidate.genericFallback &&
            this.normalizeText(
                bestCandidate.name
            ) ===
            this.normalizeText(
                secondCandidate.name
            )
        );
    }

    static async matchComponent({
        component,
        monsterActor,
        rarity
    }) {
        const index =
            await this
                .getIngredientIndex();

        const pack =
            this.getIngredientPack();

        const rarityKey =
            this.getRarityKey(
                rarity
            );

        if (!index || !pack) {
            return {
                component,
                rarity,
                rarityKey,
                status:
                    "unmatched",
                matched:
                    false,
                ambiguous:
                    false,
                item:
                    null,
                candidates:
                    []
            };
        }

        const candidates =
            index
                .map((ingredient) => {
                    const result =
                        this.scoreCandidate({
                            component,
                            monsterActor,
                            rarityKey,
                            ingredient
                        }) ?? {
                            score: 0,
                            valid: false,
                            reasons: [
                                "scoreCandidate returned no result"
                            ],
                            sourcePriority: 0,
                            identityOverlap: 0,
                            exactComponentPhrase: false,
                            genericFallback: false
                        };

                    if (!result.valid && result.reasons?.includes(
                        "scoreCandidate returned no result"
                    )) {
                        Logger.warn(
                            `No candidate score was returned for "${component?.name}" against "${ingredient?.name}".`
                        );
                    }

                    return {
                        id:
                            ingredient._id,

                        name:
                            ingredient.name,

                        img:
                            ingredient.img,

                        type:
                            ingredient.type,

                        rarity:
                            ingredient.system
                                ?.rarity ?? null,

                        uuid:
                            `Compendium.${pack.collection}.Item.${ingredient._id}`,

                        score:
                            result.score ?? 0,

                        valid:
                            result.valid ?? false,

                        reasons:
                            result.reasons ?? [],

                        sourcePriority:
                            result.sourcePriority ?? 0,

                        identityOverlap:
                            result.identityOverlap ?? 0,

                        exactComponentPhrase:
                            result.exactComponentPhrase ?? false,

                        genericFallback:
                            result.genericFallback ?? false
                    };
                })
                .filter(
                    (candidate) =>
                        candidate.valid &&
                        candidate.score > 0
                )
                .sort(
                    (
                        candidateA,
                        candidateB
                    ) =>
                        this.compareCandidates(
                            candidateA,
                            candidateB
                        )
                );

        const bestCandidate =
            candidates[0] ?? null;

        const secondCandidate =
            candidates[1] ?? null;

        const minimumMatchScore =
            80;

        if (
            !bestCandidate ||
            bestCandidate.score <
            minimumMatchScore
        ) {
            return {
                component,
                rarity,
                rarityKey,
                status:
                    "unmatched",
                matched:
                    false,
                ambiguous:
                    false,
                item:
                    null,
                candidates:
                    candidates.slice(
                        0,
                        5
                    )
            };
        }

        const ambiguous =
            this.areCandidatesAmbiguous(
                bestCandidate,
                secondCandidate
            );

        if (ambiguous) {
            return {
                component,
                rarity,
                rarityKey,
                status:
                    "ambiguous",
                matched:
                    false,
                ambiguous:
                    true,
                item:
                    null,
                candidates:
                    candidates.slice(
                        0,
                        5
                    )
            };
        }

        return {
            component,
            rarity,
            rarityKey,
            status:
                "matched",
            matched:
                true,
            ambiguous:
                false,
            item:
                bestCandidate,
            candidates:
                candidates.slice(
                    0,
                    5
                )
        };
    }

    static async matchHarvestComponents(
        monsterActor,
        harvestData
    ) {
        const matches = [];

        for (
            const component of
            harvestData?.components ??
            []
        ) {
            const match =
                await this.matchComponent({
                    component,
                    monsterActor,
                    rarity:
                        harvestData
                            ?.rarity ??
                        null
                });

            matches.push(match);
        }

        const matchedCount =
            matches.filter(
                (entry) =>
                    entry.matched
            ).length;

        const ambiguousCount =
            matches.filter(
                (entry) =>
                    entry.ambiguous
            ).length;

        const unmatchedCount =
            matches.filter(
                (entry) =>
                    entry.status ===
                    "unmatched"
            ).length;

        Logger.log(
            `Matched ${matchedCount} of ${matches.length} ingredient component${matches.length === 1
                ? ""
                : "s"
            } for "${monsterActor?.name}".`
        );

        if (
            ambiguousCount > 0 ||
            unmatchedCount > 0
        ) {
            Logger.warn(
                `"${monsterActor?.name}" has ${ambiguousCount} ambiguous and ${unmatchedCount} unmatched ingredient component(s).`
            );
        }

        Logger.debug(
            `Ingredient matches for "${monsterActor?.name}":`,
            matches
        );

        return matches;
    }
}