import { PACKS } from "../constants.js";
import { Logger } from "../logger.js";

/**
 * Handles matching scene actors to the Monsters of Drakkenheim
 * compendium and extracting harvestable component data.
 */
export class MonsterDataService {
    static #monsterPack = null;
    static #monsterIndex = null;

    /**
     * Return the Monsters of Drakkenheim actor compendium.
     *
     * @returns {CompendiumCollection|null}
     */
    static getMonsterPack() {
        if (this.#monsterPack) {
            return this.#monsterPack;
        }

        const pack = game.packs.get(
            PACKS.monsters
        );

        if (!pack) {
            Logger.error(
                `Monster compendium "${PACKS.monsters}" could not be found.`
            );

            return null;
        }

        this.#monsterPack = pack;

        return pack;
    }

    /**
     * Load and cache the monster compendium index.
     *
     * @param {object} options
     * @param {boolean} options.force
     * @returns {Promise<Collection|null>}
     */
    static async getMonsterIndex({
        force = false
    } = {}) {
        if (
            this.#monsterIndex &&
            !force
        ) {
            return this.#monsterIndex;
        }

        const pack =
            this.getMonsterPack();

        if (!pack) {
            return null;
        }

        try {
            this.#monsterIndex =
                await pack.getIndex({
                    fields: [
                        "name",
                        "img",
                        "type",
                        "flags",
                        "_stats.compendiumSource"
                    ]
                });

            Logger.log(
                `Indexed ${this.#monsterIndex.size} Monsters of Drakkenheim actors.`
            );

            return this.#monsterIndex;
        } catch (error) {
            Logger.error(
                "Failed to load the Monsters of Drakkenheim index.",
                error
            );

            return null;
        }
    }

    /**
     * Find the matching Monsters of Drakkenheim compendium actor.
     *
     * Matching priority:
     * 1. Compendium source UUID
     * 2. Exact normalized actor name
     *
     * @param {Actor} actor
     * @returns {Promise<Actor|null>}
     */
    static async findMonsterActor(actor) {
        if (!actor) {
            Logger.warn(
                "Cannot match an empty actor."
            );

            return null;
        }

        const pack =
            this.getMonsterPack();

        const index =
            await this.getMonsterIndex();

        if (!pack || !index) {
            return null;
        }

        const sourceMatch =
            this.findIndexEntryBySource(
                actor,
                index
            );

        if (sourceMatch) {
            Logger.debug(
                `Matched "${actor.name}" using its compendium source.`,
                sourceMatch
            );

            return pack.getDocument(
                sourceMatch._id
            );
        }

        const nameMatch =
            this.findIndexEntryByName(
                actor.name,
                index
            );

        if (nameMatch) {
            Logger.debug(
                `Matched "${actor.name}" using its normalized name.`,
                nameMatch
            );

            return pack.getDocument(
                nameMatch._id
            );
        }

        Logger.warn(
            `No Monsters of Drakkenheim compendium match found for "${actor.name}".`
        );

        return null;
    }

    /**
     * Match an actor using its original compendium source.
     *
     * @param {Actor} actor
     * @param {Collection} index
     * @returns {object|null}
     */
    static findIndexEntryBySource(
        actor,
        index
    ) {
        const sourceUuid =
            actor._stats?.compendiumSource ??
            actor.getFlag?.(
                "core",
                "sourceId"
            ) ??
            null;

        if (
            !sourceUuid ||
            typeof sourceUuid !== "string"
        ) {
            return null;
        }

        const expectedPrefix =
            `Compendium.${PACKS.monsters}.Actor.`;

        if (
            !sourceUuid.startsWith(
                expectedPrefix
            )
        ) {
            return null;
        }

        const documentId =
            sourceUuid
                .split(".")
                .at(-1);

        return (
            index.get(documentId) ??
            null
        );
    }

    /**
     * Match an actor using an exact normalized name.
     *
     * @param {string} actorName
     * @param {Collection} index
     * @returns {object|null}
     */
    static findIndexEntryByName(
        actorName,
        index
    ) {
        const normalizedActorName =
            this.normalizeActorName(
                actorName
            );

        if (!normalizedActorName) {
            return null;
        }

        return (
            index.find((entry) => {
                return (
                    this.normalizeActorName(
                        entry.name
                    ) ===
                    normalizedActorName
                );
            }) ?? null
        );
    }

    /**
     * Normalize an actor name for exact comparisons.
     *
     * @param {string} name
     * @returns {string}
     */
    static normalizeActorName(name) {
        return String(name ?? "")
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[’']/g, "")
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();
    }

    /**
     * Match multiple dead TokenDocuments.
     *
     * @param {TokenDocument[]} tokenDocuments
     * @returns {Promise<object[]>}
     */
    static async matchDeadTokens(
        tokenDocuments = []
    ) {
        const results = [];

        for (
            const tokenDocument of
            tokenDocuments
        ) {
            const sceneActor =
                tokenDocument.actor;

            const monsterActor =
                await this.findMonsterActor(
                    sceneActor
                );

            results.push({
                tokenDocument,
                sceneActor,
                monsterActor,
                matched:
                    Boolean(monsterActor)
            });
        }

        return results;
    }

    /**
     * Return biography HTML from a monster actor.
     *
     * @param {Actor} monsterActor
     * @returns {string}
     */
    static getBiographyHtml(
        monsterActor
    ) {
        return String(
            foundry.utils.getProperty(
                monsterActor,
                "system.details.biography.value"
            ) ?? ""
        );
    }

    /**
     * Extract UUIDs from Foundry @Embed syntax.
     *
     * @param {string} html
     * @returns {string[]}
     */
    static extractEmbedUuids(html) {
        const uuids = [];

        const pattern =
            /@Embed\[([^\]]+)](?:\{[^}]*})?/gi;

        for (
            const match of
            String(html ?? "")
                .matchAll(pattern)
        ) {
            const embedExpression =
                match[1]?.trim();

            if (!embedExpression) {
                continue;
            }

            const [uuid] =
                embedExpression.split(
                    /\s+/
                );

            if (uuid) {
                uuids.push(uuid);
            }
        }

        return [
            ...new Set(uuids)
        ];
    }

    /**
     * Resolve every document embedded in the monster biography.
     *
     * @param {Actor} monsterActor
     * @returns {Promise<object[]>}
     */
    static async resolveBiographyEmbeds(
        monsterActor
    ) {
        const biographyHtml =
            this.getBiographyHtml(
                monsterActor
            );

        const embedUuids =
            this.extractEmbedUuids(
                biographyHtml
            );

        Logger.debug(
            `Found ${embedUuids.length} biography embed(s) for "${monsterActor.name}".`,
            embedUuids
        );

        const results = [];

        for (const uuid of embedUuids) {
            try {
                const document =
                    await fromUuid(uuid);

                results.push({
                    uuid,
                    document,
                    resolved:
                        Boolean(document),
                    html:
                        document
                            ? this.getDocumentHtml(
                                document
                            )
                            : ""
                });
            } catch (error) {
                Logger.warn(
                    `Could not resolve biography embed "${uuid}" for "${monsterActor.name}".`,
                    error
                );

                results.push({
                    uuid,
                    document: null,
                    resolved: false,
                    html: ""
                });
            }
        }

        return results;
    }

    /**
     * Return HTML content from a resolved document.
     *
     * @param {Document} document
     * @returns {string}
     */
    static getDocumentHtml(document) {
        const candidatePaths = [
            "text.content",
            "system.description.value",
            "system.description",
            "system.details.biography.value",
            "content"
        ];

        for (
            const path of
            candidatePaths
        ) {
            const value =
                foundry.utils.getProperty(
                    document,
                    path
                );

            if (
                typeof value === "string" &&
                value.trim().length > 0
            ) {
                return value;
            }
        }

        return "";
    }

    /**
     * Find embedded documents containing Harvestable Components.
     *
     * @param {Actor} monsterActor
     * @returns {Promise<object[]>}
     */
    static async findHarvestDocuments(
        monsterActor
    ) {
        const embeds =
            await this.resolveBiographyEmbeds(
                monsterActor
            );

        return embeds.filter(
            (entry) =>
                /harvestable\s+components/i
                    .test(entry.html)
        );
    }

    /**
     * Normalize a rarity label.
     *
     * @param {string} rarity
     * @returns {string|null}
     */
    static normalizeRarity(rarity) {
        const normalized =
            String(rarity ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

        const knownRarities = {
            common:
                "Common",
            uncommon:
                "Uncommon",
            rare:
                "Rare",
            "very rare":
                "Very Rare",
            legendary:
                "Legendary",
            artifact:
                "Artifact"
        };

        return (
            knownRarities[normalized] ??
            (
                normalized
                    ? normalized.replace(
                        /\b\w/g,
                        (character) =>
                            character
                                .toUpperCase()
                    )
                    : null
            )
        );
    }

    /**
     * Resolve the final rarity for a specific monster actor.
     *
     * @param {Actor} monsterActor
     * @param {object} rarityData
     * @returns {string|null}
     */
    static evaluateHarvestRarity(
        monsterActor,
        rarityData
    ) {
        if (!rarityData) {
            return null;
        }

        if (
            rarityData.type ===
                "fixed" &&
            rarityData.rarity
        ) {
            return rarityData.rarity;
        }

        if (
            rarityData.type !==
            "variable"
        ) {
            return (
                rarityData.rarity ??
                null
            );
        }

        const actorName =
            String(
                monsterActor?.name ??
                ""
            )
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

        const rarityEntries =
            Object.entries(
                rarityData.rarities ??
                {}
            )
                .sort(
                    ([formA], [formB]) =>
                        formB.length -
                        formA.length
                );

        for (
            const [form, rarity] of
            rarityEntries
        ) {
            const normalizedForm =
                String(form)
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim()
                    .toLowerCase();

            if (
                normalizedForm &&
                actorName.includes(
                    normalizedForm
                )
            ) {
                return rarity;
            }
        }

        Logger.warn(
            `Could not evaluate variable harvest rarity for "${monsterActor?.name}".`,
            rarityData
        );

        return null;
    }

    /**
     * Parse variable creature-form rarities.
     *
     * @param {string} text
     * @returns {object}
     */
    static parseVariableRarities(text) {
        const rarities = {};

        const normalizedText =
            String(text ?? "")
                .replace(/\s+/g, " ")
                .trim();

        if (!normalizedText) {
            return rarities;
        }

        const rarityPattern =
            /(?:^|[;,.]\s*)([^:;,.]+?)\s*:\s*(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)\b/gi;

        for (
            const match of
            normalizedText.matchAll(
                rarityPattern
            )
        ) {
            const form =
                String(
                    match[1] ?? ""
                )
                    .replace(
                        /^component rarities are as follows\s*/i,
                        ""
                    )
                    .trim();

            const rarity =
                this.normalizeRarity(
                    match[2]
                );

            if (form && rarity) {
                rarities[form] =
                    rarity;
            }
        }

        return rarities;
    }

    /**
     * Clean a parsed component name.
     *
     * Examples:
     * "or Aberrant" -> "Aberrant"
     * "and Monster Blood" -> "Monster Blood"
     *
     * @param {string} name
     * @returns {string}
     */
    static cleanComponentName(name) {
        return String(name ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .replace(
                /^(?:and|or)\s+/i,
                ""
            )
            .replace(
                /^[,;:.–—-]+\s*/,
                ""
            )
            .replace(
                /[.;]\s*$/,
                ""
            )
            .trim();
    }

    /**
     * Parse the Harvestable Components section from HTML.
     *
     * @param {string} html
     * @returns {object[]}
     */
    static parseHarvestComponents(
        html
    ) {
        if (
            typeof html !== "string" ||
            !html.trim()
        ) {
            return [];
        }

        const parser =
            new DOMParser();

        const parsedDocument =
            parser.parseFromString(
                html,
                "text/html"
            );

        const headings =
            Array.from(
                parsedDocument
                    .querySelectorAll(
                        "h1, h2, h3, h4, h5, h6"
                    )
            );

        const harvestHeading =
            headings.find(
                (heading) =>
                    /harvestable\s+components/i
                        .test(
                            heading
                                .textContent ??
                            ""
                        )
            );

        if (!harvestHeading) {
            return [];
        }

        const paragraphs = [];

        let currentElement =
            harvestHeading
                .nextElementSibling;

        while (currentElement) {
            if (
                /^H[1-6]$/.test(
                    currentElement.tagName
                )
            ) {
                break;
            }

            if (
                currentElement
                    .matches?.("p")
            ) {
                paragraphs.push(
                    currentElement
                );
            }

            const nestedParagraphs =
                currentElement
                    .querySelectorAll
                    ? Array.from(
                        currentElement
                            .querySelectorAll(
                                "p"
                            )
                    )
                    : [];

            paragraphs.push(
                ...nestedParagraphs
            );

            currentElement =
                currentElement
                    .nextElementSibling;
        }

        const categories = [];

        for (
            const paragraph of
            paragraphs
        ) {
            const strong =
                paragraph
                    .querySelector(
                        "strong"
                    );

            if (!strong) {
                continue;
            }

            const rawCategory =
                strong
                    .textContent
                    ?.trim() ??
                "";

            const category =
                rawCategory
                    .replace(
                        /:\s*$/,
                        ""
                    )
                    .trim();

            if (!category) {
                continue;
            }

            const paragraphClone =
                paragraph.cloneNode(
                    true
                );

            paragraphClone
                .querySelector(
                    "strong"
                )
                ?.remove();

            const componentText =
                paragraphClone
                    .textContent
                    ?.replace(
                        /^\s*:\s*/,
                        ""
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim() ??
                "";

            if (!componentText) {
                continue;
            }

            const components =
                componentText
                    .replace(
                        /[.;]\s*$/,
                        ""
                    )
                    .split(",")
                    .map(
                        (component) =>
                            this
                                .cleanComponentName(
                                    component
                                )
                    )
                    .filter(Boolean);

            if (
                components.length === 0
            ) {
                continue;
            }

            categories.push({
                category,
                components
            });
        }

        return categories;
    }

    /**
     * Parse component rarity information.
     *
     * @param {string} html
     * @returns {object}
     */
    static parseHarvestRarity(html) {
        const emptyResult = {
            type:
                "unknown",
            rarity:
                null,
            rarities:
                {},
            heading:
                "",
            description:
                ""
        };

        if (
            typeof html !== "string" ||
            !html.trim()
        ) {
            return emptyResult;
        }

        const parser =
            new DOMParser();

        const parsedDocument =
            parser.parseFromString(
                html,
                "text/html"
            );

        const headings =
            Array.from(
                parsedDocument
                    .querySelectorAll(
                        "h1, h2, h3, h4, h5, h6"
                    )
            );

        const harvestHeading =
            headings.find(
                (heading) =>
                    /harvestable\s+components/i
                        .test(
                            heading
                                .textContent ??
                            ""
                        )
            );

        if (!harvestHeading) {
            return emptyResult;
        }

        const headingText =
            String(
                harvestHeading
                    .textContent ??
                ""
            )
                .replace(/\s+/g, " ")
                .trim();

        const headingMatch =
            headingText.match(
                /harvestable\s+components\s*\(([^)]+)\)/i
            );

        const headingRarity =
            headingMatch?.[1]
                ?.trim() ??
            null;

        if (
            headingRarity &&
            !/^rarity\s+varies$/i
                .test(headingRarity)
        ) {
            return {
                type:
                    "fixed",
                rarity:
                    this.normalizeRarity(
                        headingRarity
                    ),
                rarities:
                    {},
                heading:
                    headingText,
                description:
                    ""
            };
        }

        const descriptionParts =
            [];

        let currentElement =
            harvestHeading
                .nextElementSibling;

        while (currentElement) {
            if (
                /^H[1-6]$/.test(
                    currentElement.tagName
                )
            ) {
                break;
            }

            const strong =
                currentElement
                    .querySelector?.(
                        "strong"
                    );

            if (strong) {
                break;
            }

            const text =
                String(
                    currentElement
                        .textContent ??
                    ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            if (text) {
                descriptionParts.push(
                    text
                );
            }

            currentElement =
                currentElement
                    .nextElementSibling;
        }

        const description =
            descriptionParts.join(
                " "
            );

        const rarities =
            this.parseVariableRarities(
                description
            );

        if (
            /^rarity\s+varies$/i
                .test(
                    headingRarity ??
                    ""
                ) ||
            Object.keys(
                rarities
            ).length > 0
        ) {
            return {
                type:
                    "variable",
                rarity:
                    null,
                rarities,
                heading:
                    headingText,
                description
            };
        }

        return {
            ...emptyResult,
            heading:
                headingText,
            description
        };
    }

    /**
     * Flatten category records into one record per component.
     *
     * @param {object[]} categories
     * @returns {object[]}
     */
    static flattenHarvestComponents(
        categories = []
    ) {
        return categories.flatMap(
            (categoryEntry) =>
                categoryEntry
                    .components
                    .map(
                        (
                            componentName
                        ) => ({
                            category:
                                categoryEntry
                                    .category,
                            name:
                                componentName
                        })
                    )
        );
    }

    /**
     * Inspect a matched monster actor.
     *
     * @param {Actor} monsterActor
     * @returns {Promise<object>}
     */
    static async inspectHarvestData(
        monsterActor
    ) {
        const emptyRarityData = {
            type:
                "unknown",
            rarity:
                null,
            rarities:
                {},
            heading:
                "",
            description:
                ""
        };

        if (!monsterActor) {
            Logger.warn(
                "Cannot inspect harvesting data without a monster actor."
            );

            return {
                monsterActor:
                    null,
                biographyHtml:
                    "",
                embeds:
                    [],
                harvestDocuments:
                    [],
                rarity:
                    null,
                rarityData:
                    emptyRarityData,
                rarityEntries:
                    [],
                categories:
                    [],
                components:
                    []
            };
        }

        const biographyHtml =
            this.getBiographyHtml(
                monsterActor
            );

        const embeds =
            await this
                .resolveBiographyEmbeds(
                    monsterActor
                );

        const harvestDocuments =
            embeds.filter(
                (entry) =>
                    /harvestable\s+components/i
                        .test(
                            entry.html
                        )
            );

        const parsedCategories =
            [];

        const rarityEntries =
            [];

        for (
            const harvestDocument of
            harvestDocuments
        ) {
            const documentCategories =
                this.parseHarvestComponents(
                    harvestDocument.html
                );

            const documentRarityData =
                this.parseHarvestRarity(
                    harvestDocument.html
                );

            parsedCategories.push(
                ...documentCategories
            );

            rarityEntries.push({
                documentUuid:
                    harvestDocument.uuid,
                ...documentRarityData
            });
        }

        const harvestableCategories =
            parsedCategories.filter(
                (entry) => {
                    const normalizedCategory =
                        String(
                            entry.category ??
                            ""
                        )
                            .trim()
                            .toLowerCase()
                            .replace(
                                /[.:;]+$/,
                                ""
                            );

                    return (
                        normalizedCategory !==
                        "delerium"
                    );
                }
            );

        const components =
            this.flattenHarvestComponents(
                harvestableCategories
            );

        const rarityData =
            rarityEntries[0] ??
            emptyRarityData;

        const evaluatedRarity =
            this.evaluateHarvestRarity(
                monsterActor,
                rarityData
            );

        Logger.log(
            `Found ${components.length} harvestable component${
                components.length === 1
                    ? ""
                    : "s"
            } for "${monsterActor.name}" with rarity "${
                evaluatedRarity ??
                "Unknown"
            }".`
        );

        Logger.debug(
            `Harvest inspection for "${monsterActor.name}":`,
            {
                biographyHtml,
                embeds,
                harvestDocuments,
                rarity:
                    evaluatedRarity,
                rarityData,
                rarityEntries,
                categories:
                    harvestableCategories,
                components
            }
        );

        if (
            components.length > 0
        ) {
            console.table(
                components.map(
                    (component) => ({
                        category:
                            component
                                .category,
                        component:
                            component
                                .name,
                        rarity:
                            evaluatedRarity ??
                            "Unknown"
                    })
                )
            );
        }

        return {
            monsterActor,
            biographyHtml,
            embeds,
            harvestDocuments,
            rarity:
                evaluatedRarity,
            rarityData,
            rarityEntries,
            categories:
                harvestableCategories,
            components
        };
    }
}