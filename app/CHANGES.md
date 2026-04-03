# Session Changes

- Reduced sidebar background colors (`background.sidebar`, `background.level1`) to be more subtle
- Made entire sidebar entry bar clickable for expand/collapse with smooth chevron rotation animation
- Fixed sidebar entry overflow during expand/collapse by setting `overflow: hidden` on spring controller
- Delayed sidebar entry content unmounting on collapse so children remain in DOM until animation completes
- Fixed Grid Header buttons (Spacing, Zoom, Sort direction) hover states and unified tooltips via `IconButton` wrapper
- Replaced `PillButton` spring-based hover with CSS `:hover` and `transition`, added icon vertical bump animation on hover
- Replaced custom Sort dropdown (`Selector`) with voodo `Select` component
- Replaced custom `DatasetSelector` with voodo `Select` component, constrained to `160px` max-width with separator border
- Added `letter-spacing: 0.02em` globally to open up text spacing
- Added Settings modal (gear icon, top-right nav) with left sidebar nav and stubbed Hotkeys, Appearance, Notifications, Security sections
- Added gear icon button to app top-right nav to open the Settings modal
- Added Pixi/WebGL initialization error handling in `LighterSampleRenderer` with user-facing error panel including a Lottie GPU animation and plain-English WebGL context error message
- Removed histogram tooltip animation lag by disabling Recharts animation and tracking cursor coordinates directly for accurate positioning
- Centered histogram `BarChart` within its container
- Doubled zoom and spacing slider widths to `9rem`, added live drag updates, added "Spacing" / "Image Zoom" hover tooltips
- Changed `valueLabelDisplay` in `BaseSlider` to support `"auto"` mode (shows value on hover) alongside existing `"on"` and `"off"` states
- Fixed `ViewStageParameter` text vertical alignment via `align-items: center` on flex container, removed manual margin hacks
