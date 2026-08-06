# Morelord Drakkenheim Harvesting

A Foundry VTT module for streamlining creature harvesting in **Dungeons of Drakkenheim**.

Morelord Drakkenheim Harvesting scans dead NPCs on the active scene, identifies supported Drakkenheim monsters, reads their harvestable component data, matches those components to ingredient items from Antics & Rolls Drakkenheim Mastercraft, and presents a shared harvesting interface to the GM and players.

The goal is to turn the harvesting process from a manual lookup-and-drag workflow into a fast, synchronized player-facing system.

## Requirements

This module currently expects the following modules/content packs to be installed and enabled:

- `morelord-core`
- `drakkenheim-monsters`
- `antics-and-rolls-drakkenheim-mastercraft`

The module is designed for Foundry VTT v14.

## Installation

### Install from Foundry

In Foundry VTT:

1. Return to **Configuration and Setup**.
2. Open **Add-on Modules**.
3. Click **Install Module**.
4. Paste the following URL into the **Manifest URL** field:

```text
https://raw.githubusercontent.com/tmoreland72/morelord-drakkenheim-harvesting/main/module.json
```

5. Click **Install**.
6. After installation, open your world and enable **Morelord Drakkenheim Harvesting** under **Manage Modules**.

This manifest URL is intended to remain stable. Future module updates will use the same URL, while the manifest points Foundry to the appropriate versioned GitHub Release package.

### Required Modules

Before using Morelord Drakkenheim Harvesting, make sure the following required content/modules are installed and enabled:

- `drakkenheim-monsters` — **Monsters of Drakkenheim**. This is a **paid module available through the Foundry VTT Marketplace**.
- `antics-and-rolls-drakkenheim-mastercraft` — **Antics & Rolls Drakkenheim Mastercraft**. This module is **free as of this release**.

These dependencies provide the Drakkenheim monster data and Antics & Rolls harvesting ingredient items used by this module.

> Availability and pricing of third-party modules may change over time. The descriptions above reflect their status as of this release.

### Installing an Older Version

Current installations should normally use the stable manifest URL above.

Older releases can be installed manually from the project's GitHub Releases page if a GM needs to return to a previous version:

```text
https://github.com/tmoreland72/morelord-drakkenheim-harvesting/releases
```

Each release contains a version-specific ZIP package.

## Current Features

### Dead Creature Scanning

The GM can use the harvesting scene control to scan the active scene for dead NPC tokens.

A token is considered dead if one or more of the following are true:

- Its hit points are 0 or lower.
- It has the Dead status.
- Its combatant is marked Defeated.

Only NPC actors are considered.

### Drakkenheim Monster Matching

Dead tokens are matched against the Drakkenheim monster compendium.

The module supports matching by source information and normalized actor name so that scene tokens can still be recognized even when their displayed names vary slightly.

### Harvestable Component Parsing

The module reads the monster's biography and resolves embedded Drakkenheim journal entries containing harvest information.

It extracts the **Harvestable Components** section, including categories such as:

- Animus
- Fluid
- Organs
- Bones
- Natural Weapons
- Hide
- Dust

Delerium entries are intentionally excluded from the harvesting component list because this module is focused on monster-part harvesting rather than delerium extraction.

### Harvest Rarity

The module determines the appropriate harvesting rarity for each creature.

It supports both fixed rarities and creatures whose harvest rarity changes by creature stage or variant, such as wyrmling, young, adult, and ancient creatures.

### Ingredient Matching

Harvested components are matched to items in the Antics & Rolls Drakkenheim Mastercraft ingredients compendium.

Matching considers:

- Component name
- Component category
- Monster/source type
- Ingredient rarity
- Specific creature-source wording
- Generic fallback ingredients

When a highly specific ingredient does not exist, the module can fall back to an appropriate generic ingredient for the component category and rarity.

For example, a creature's Brain may fall back to a generic Organ ingredient when no more specific matching item is available.

### Shared Harvest Session

When the GM scans a scene, the module creates a shared harvest session containing all supported dead creatures and their available components.

The session is synchronized between the GM and connected players using Foundry's module socket system.

### Player Harvesting Interface

Players receive a shared harvesting window showing:

- Each harvestable creature
- Creature image
- Harvest rarity
- Available components
- Component category
- Matching ingredient item
- Claim status
- Which character claimed a component

Each creature grouping can be expanded or collapsed.

When a player successfully claims a component from a creature, that creature automatically collapses for that player.

### Claim Rules

Each player may claim **one component per creature**.

Each individual component may only be claimed by one player.

The GM is authoritative for claim validation, so simultaneous claims are resolved safely through the socket layer.

Players may release their own claims before the harvest is finalized.

The GM may release any claim.

### Live Synchronization

Claims and releases are synchronized to all connected clients.

When one player claims a component:

- Other players immediately see that component as claimed.
- The claiming character is displayed.
- Other components on that creature become unavailable to that same player because they have already made their selection.

### Scroll and UI State

The harvesting interface preserves the user's scroll position when the shared session updates.

This prevents players from being returned to the top of a long harvesting list whenever another player makes a claim.

### Finalize Harvest

The GM can finalize the harvest after players have made their selections.

Finalizing the harvest:

- Reads every active claim.
- Resolves the matched ingredient item.
- Creates a copy of that item directly on the claiming character.
- Marks successfully awarded components so they are not duplicated if finalization must be retried.
- Locks finalized harvest claims.

The GM receives a summary of successful and failed item awards.

## Typical GM Workflow

1. Defeat one or more supported Drakkenheim creatures on the active scene.
2. Click the harvesting scene-control button.
3. The module scans the scene and creates a harvest session.
4. The harvesting window opens for the GM and connected players.
5. Players expand creature groups and select one component from each creature they wish to harvest.
6. Claims synchronize between all clients.
7. The GM reviews the selections.
8. The GM clicks **Finalize Harvest**.
9. The claimed ingredient items are added directly to the appropriate character inventories.

## Module Structure

The module is organized into separate application, model, and service layers.

Typical structure:

```text
morelord-drakkenheim-harvesting/
├── module.json
├── README.md
├── scripts/
│   ├── main.js
│   ├── constants.js
│   ├── logger.js
│   ├── apps/
│   │   └── harvest-app.js
│   ├── models/
│   │   └── harvest-session.js
│   └── services/
│       ├── scene-harvest-service.js
│       ├── monster-data-service.js
│       ├── ingredient-service.js
│       ├── harvest-socket-service.js
│       └── harvest-award-service.js
├── templates/
│   └── harvest-app.hbs
└── styles/
    └── harvest-app.css
```

## Notes for GMs

This module currently assumes that players who claim harvested ingredients have a character assigned to their Foundry user.

If a claim cannot be associated with a valid character actor, the award will fail and the GM will be notified during finalization.

The module currently keeps the active harvest session in memory, so the session should be finalized before reloading the world or restarting Foundry.

## Remaining Work

The following features are planned or still under consideration.

### Persist Active Harvest Sessions

Store the active harvest session on the Scene so that it survives:

- Browser refreshes
- GM reconnects
- Player reconnects
- Foundry restarts

Every claim, release, and finalization should update the persisted session.

### Mark Corpses as Harvested

When a harvest is finalized, mark participating tokens as already harvested.

Future scans should ignore those corpses so the same creature cannot be harvested repeatedly.

A GM reset option should also be available in case a corpse needs to be made harvestable again.

### Protect Active Sessions

If a harvest session is already active, prevent the GM from accidentally replacing it with a new scan.

The GM should be prompted to finalize or clear the current session first.

### Clear Harvest Session

Add a GM-facing **Clear Harvest** action that:

- Clears the current session.
- Removes any persisted scene data.
- Closes the harvesting window for all connected players.

### Improved Player Progress

Add player-facing progress information such as:

- `3 / 8 creatures selected`
- Clear indication of which creatures still need a selection
- Optional automatic collapsing of previously completed creatures after reconnecting or refreshing

### Harvest Completion Summary

Create a cleaner final harvest summary, potentially as a chat card, showing which character received each harvested ingredient.

### Harvesting Mechanics

Optionally integrate the actual harvesting process rather than treating a claim as an automatic successful harvest.

Possible additions include:

- Harvesting checks
- Skill or tool requirements
- Harvest DCs
- Time required
- Failure consequences
- Contamination risks
- Creature-specific harvesting complications

### Additional Compatibility and Configuration

Future versions may add:

- Support for additional Drakkenheim content packs
- Configurable ingredient compendiums
- Configurable monster compendiums
- GM settings for claim limits
- Optional generic ingredient fallback rules
- Additional compatibility with third-party harvesting or inventory modules
- Search monsters by harvestable component for GM


## Standard and Premium Harvesting

### Standard: GM-Managed Harvesting

The free Standard workflow remains fully functional. The harvesting window opens for the GM, who selects a character from the single selector at the top and then uses the normal Claim buttons to assign components to that character. Each character may receive one component from each creature.

### Premium: Collaborative Player Harvesting

Accounts with the **Collaborative Player Harvesting** feature (`drakkenheim-harvesting.player-claims`) retain the existing shared workflow. Player windows open automatically, each player claims for their own assigned character, and all claims synchronize live.

The session mode is fixed when the GM creates the session. A membership change cannot alter an active harvest.

## Publishing a Release

Run the release script from **PowerShell** in the repository root.

Validate and package a release without changing Git or GitHub:

```powershell
.\release.ps1 -Version 0.3.2 -DryRun
```

Publish a normal release:

```powershell
.\release.ps1 -Version 0.3.2
```

Optional release modes:

```powershell
.\release.ps1 -Version 0.3.2 -Prerelease
.\release.ps1 -Version 0.3.2 -Draft
.\release.ps1 -Version 0.3.2 -CommitMessage "Release v0.3.2"
```

The script verifies the repository, branch, remote, GitHub CLI authentication, manifest, archive layout, URLs, and UTF-8 encoding. A dry run builds and validates a temporary ZIP without modifying project files, Git history, tags, or GitHub releases.
