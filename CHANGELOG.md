# Morelord Drakkenheim Harvesting Changelog

## 0.4.0

### Changed

- Harvest Dead Creatures registers with Morelord Core's Morelord Tools control (`morelord-drakkenheim-harvesting`, scalpel icon, order 31) so it sits immediately after Craftworks. The tool stays GM-only and still scans the active scene on click.
- Morelord Core 0.6.0 is now a required dependency.

### Compatibility

- When Morelord Core is older than 0.6.0, or is not installed, the GM still gets the previous Harvest Dead Creatures button on the Token palette.

## 0.3.3

### Fixed

- Fixed harvesting sessions started from the scene-control button always using GM-managed mode.
- The normal Harvest Dead Creatures workflow now checks Morelord Core before creating the session.
- Premium and Champion members now receive collaborative player harvesting when using the scene-control button.
- The selected session mode remains fixed for the life of the harvesting session.

## 0.3.2

### Fixed

- Fixed collaborative player harvesting not opening for some Premium and Champion members when the product-specific feature key was absent from an otherwise valid paid entitlement response.
- Added paid-tier and broad-membership compatibility fallbacks while preserving the product-specific entitlement as the preferred authorization check.
- Added clearer entitlement diagnostics to the browser console for troubleshooting access synchronization.

## 0.2.1

### Fixed

- Fixed collaborative player harvesting not opening for some Premium and Champion members when the product-specific feature key was absent from an otherwise valid paid entitlement response.
- Added paid-tier and broad-membership compatibility fallbacks while preserving the product-specific entitlement as the preferred authorization check.
- Added clearer entitlement diagnostics to the browser console for troubleshooting access synchronization.

## 0.2.0

### Added

- Added a complete GM-managed Standard workflow.
- Added one character selector at the top of the GM harvesting window.
- Existing Claim buttons assign components to the selected character.
- Each character may receive one component from each creature.
- Added premium Collaborative Player Harvesting through Morelord Core.
- Collaborative sessions preserve the module's existing synchronized player-claim workflow.
- Session mode is fixed when the harvesting session begins.
- Added Morelord Core as an installable required dependency.
- Existing claims, awards, and harvesting data are preserved when membership changes.
