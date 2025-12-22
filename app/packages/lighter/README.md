# Lighter Architecture Documentation

## Overview

Lighter is a lightweight 2D/3D rendering engine designed for visualizing
FiftyOne samples with overlays. It provides a modular, event-driven
architecture that separates concerns between scene management, rendering,
interaction handling, and overlay representation.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  React Hooks (useLighter, useSceneSelectionState, etc.)         │
│  LighterSampleRenderer Component                                │
├─────────────────────────────────────────────────────────────────┤
│                        Scene Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  Scene2D ──┐                                                    │
│            ├── EventBus                                         │
│            ├── InteractionManager                               │
│            ├── SelectionManager                                 │
│            ├── UndoRedoManager                                  │
│            ├── RenderingStateManager                            │
│            └── CoordinateSystem2D                               │
├─────────────────────────────────────────────────────────────────┤
│                      Overlay Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  BaseOverlay ──┐                                                │
│                ├── ImageOverlay (CanonicalMedia)                │
│                ├── BoundingBoxOverlay (Spatial, Selectable)     │
│                ├── ClassificationOverlay (Selectable)           │
│                └── Custom Overlays                              │
├─────────────────────────────────────────────────────────────────┤
│                     Renderer Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  Renderer2D Interface ── PixiRenderer2D Implementation          │
├─────────────────────────────────────────────────────────────────┤
│                    Resource Layer                               │
├─────────────────────────────────────────────────────────────────┤
│  ResourceLoader Interface ── PixiResourceLoader Implementation  │
├─────────────────────────────────────────────────────────────────┤
│                      Utility Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  Color Utils, Command Pattern, Plugin Registry                  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Scene2D - The Central Orchestrator

**Location**: `src/core/Scene2D.ts`

**Responsibilities**:

-   Manages overlay lifecycle (add, remove, render)
-   Coordinates rendering pipeline
-   Handles coordinate transformations
-   Manages canonical media for spatial overlays
-   Orchestrates interaction and selection systems
-   Manages overlay ordering and rotation
-   Handles render callbacks and scene options

**Key Dependencies**:

```typescript
class Scene2D {
    private overlays: Map<string, BaseOverlay>;
    private undoRedo: UndoRedoManager;
    private interactionManager: InteractionManager;
    private selectionManager: SelectionManager;
    private coordinateSystem: CoordinateSystem;
    private renderingState: RenderingStateManager;
    private canonicalMedia?: CanonicalMedia;
    private renderCallbacks: Map<string, RenderCallback>;
    private overlayOrder: string[];
    private rotation: number;
}
```

**Key Public Methods**:

-   `addOverlay(overlay: BaseOverlay)`: Add overlay to scene
-   `removeOverlay(id: string)`: Remove overlay from scene
-   `startRenderLoop()`: Start the rendering loop
-   `registerRenderCallback(callback: RenderCallback)`: Register render
    callbacks
-   `undo()`, `redo()`, `canUndo()`, `canRedo()`: Undo/redo operations
-   `selectOverlay(id: string)`, `deselectOverlay(id: string)`: Selection
    management
-   `setCanonicalMedia(overlay: BaseOverlay & CanonicalMedia)`: Set coordinate
    reference
-   `getVisibleOverlays()`, `getSelectedOverlays()`: Query overlays

### 2. Event System

**Location**: `src/event/EventBus.ts`

**Design Pattern**: Observer Pattern with typed events

**Key Event Types**:

-   **Overlay Events**: `OVERLAY_ADDED`, `OVERLAY_REMOVED`, `OVERLAY_LOADED`,
    `OVERLAY_ERROR`
-   **Annotation Events**: `ANNOTATION_ADDED`, `ANNOTATION_REMOVED`
-   **Interaction Events**: `OVERLAY_CLICK`, `OVERLAY_DRAG_START`,
    `OVERLAY_DRAG_MOVE`, `OVERLAY_DRAG_END`, `OVERLAY_HOVER`,
    `OVERLAY_UNHOVER`, `OVERLAY_HOVER_MOVE`
-   **Selection Events**: `OVERLAY_SELECT`, `OVERLAY_DESELECT`,
    `SELECTION_CHANGED`, `SELECTION_CLEARED`
-   **Spatial Events**: `SPATIAL_SHIFT`, `SPATIAL_RESIZE`, `SPATIAL_MOVE`
-   **System Events**: `RESIZE`, `CANONICAL_MEDIA_CHANGED`,
    `SCENE_OPTIONS_CHANGED`
-   **Resource Events**: `RESOURCE_LOADED`, `RESOURCE_ERROR`
-   **Undo/Redo Events**: `UNDO`, `REDO`

### 3. Overlay System

**Location**: `src/overlay/`

**Base Class**: `BaseOverlay` implements `InteractionHandler`

**Built-in Overlays**:

-   **ImageOverlay**: Displays sample images, implements `CanonicalMedia`
-   **BoundingBoxOverlay**: Detection boxes with drag support
-   **ClassificationOverlay**: Text labels with selection

**Interface Implementations**:

```typescript
interface Spatial {
    getRelativeBounds(): Rect;
    setAbsoluteBounds(bounds: Rect): void;
    getAbsoluteBounds(): Rect;
    setRelativeBounds(bounds: Rect): void;
    needsCoordinateUpdate(): boolean;
    markForCoordinateUpdate(): void;
    markCoordinateUpdateComplete(): void;
}

interface Selectable {
    isSelected(): boolean;
    setSelected(selected: boolean): void;
    getSelectionPriority(): number;
}

interface Movable {
    getPosition(): Point;
    setPosition(position: Point): void;
    markDirty(): void;
}

interface Hoverable {
    getTooltipInfo(): {
        color: string;
        field: string;
        label: any;
        type: string;
    } | null;
    onHoverEnter?(point: Point, event: PointerEvent): boolean;
    onHoverLeave?(point: Point, event: PointerEvent): boolean;
    onHoverMove?(point: Point, event: PointerEvent): boolean;
}
```

**Factory Pattern**: `OverlayFactory` for type-safe dynamic overlay creation

### 4. Rendering System

**Location**: `src/renderer/`

**Interface**: `Renderer2D` defines drawing operations

**Implementation**: `PixiRenderer2D` using PixiJS v8

**Key Features**:

-   **Layered Rendering**: Background (images) and foreground (overlays)
    containers
-   **Element Tracking**: Map-based element management for disposal
-   **Hit Testing**: Point-in-bounds testing for interaction
-   **Performance**: Texture caching and optimized drawing operations
-   **Image Support**: Multiple image source types (HTML, Canvas, Texture,
    ImageData, Bitmap)

**Renderer Methods**:

-   `drawRect()`, `drawText()`, `drawLine()`, `drawImage()`: Drawing primitives
-   `startRenderLoop()`, `stopRenderLoop()`: Render loop management
-   `dispose()`, `hide()`, `show()`: Container management

### 5. Interaction System

**Location**: `src/interaction/InteractionManager.ts`

**Responsibilities**:

-   Pointer event handling (down, move, up)
-   Drag state management
-   Click detection and double-click handling
-   Hover state management
-   Integration with selection system
-   Keyboard shortcuts for undo/redo operations

**Keyboard Shortcuts**:

-   **Undo**: `Ctrl+Z` (Windows/Linux) or `Cmd+Z` (Mac)
-   **Redo**: `Ctrl+Y` or `Ctrl+Shift+Z` (Windows/Linux) or `Cmd+Y` or
    `Cmd+Shift+Z` (Mac)
-   **Rotation**: Arrow Up/Down for overlay rotation

**Features**:

-   Automatic canvas focus when clicked
-   Input field detection (shortcuts disabled in text inputs)
-   Cross-platform modifier key support (Ctrl/Cmd)
-   Event propagation prevention to avoid conflicts

### 6. Selection System

**Location**: `src/selection/SelectionManager.ts`

**Features**:

-   Programmatic selection API
-   Event emission for selection changes

### 7. Coordinate System

**Location**: `src/core/CoordinateSystem2D.ts`

**Purpose**: Transform between relative [0,1] and absolute pixel coordinates

**Key Operations**:

-   `relativeToAbsolute()`: Convert normalized coordinates to pixels
-   `absoluteToRelative()`: Convert pixels to normalized coordinates
-   `updateTransform()`: Update transformation matrix from canonical media

### 8. Undo/Redo System

**Location**: `src/undo/`

**Design Pattern**: Command Pattern

**Components**:

-   `Command` interface for operations
-   `UndoRedoManager` for stack management
-   `MoveOverlayCommand` for overlay movement

**Features**:

-   Configurable stack size (default: 100)
-   Automatic redo stack clearing on new commands
-   Memory-efficient command management

### 9. Resource Management

**Location**: `src/resource/`

**Components**:

-   `ResourceLoader` interface
-   `PixiResourceLoader` implementation using PixiJS Assets
-   `globalPixiResourceLoader` singleton

**Features**:

-   Background loading with `loadBackground()`
-   Retry logic with exponential backoff
-   Memory management with `unload()`

### 10. Rendering State Management

**Location**: `src/core/RenderingStateManager.ts`

**Purpose**: Track overlay rendering status throughout the pipeline

**Status Types**:

-   `pending`: Initial state
-   `decoded`: Resources loaded
-   `painting`: Currently rendering
-   `painted`: Successfully rendered
-   `error`: Rendering failed

## Data Flow

### 1. Scene Initialization

```
React Component → useLighterSetup → Scene2D → Managers → EventBus
```

### 2. Overlay Addition

```
OverlayFactory.create() → Scene2D.addOverlay() →
  ├── Dependency Injection (renderer, eventBus, resourceLoader)
  ├── Manager Registration (interaction, selection)
  ├── Coordinate Update (if spatial)
  └── Event Emission (OVERLAY_ADDED)
```

### 3. Rendering Cycle

```
Scene2D.renderFrame() →
  ├── Coordinate Updates (spatial overlays)
  ├── Overlay.render() → Renderer2D.draw*()
  ├── State Management (pending → painting → painted)
  ├── Render Callbacks (before/after phases)
  └── Error Handling (error status)
```

### 4. User Interaction

```
Canvas Event → InteractionManager →
  ├── Hit Testing → Overlay Handler
  ├── Selection Management
  ├── Drag State Management
  └── Event Emission → Scene2D → Overlays
```

### 5. Coordinate Transformation

```
Canonical Media Bounds Change →
  ├── CoordinateSystem.updateTransform()
  ├── Spatial Overlay Updates
  ├── Relative/Absolute Conversion
  └── Re-render Trigger
```

## React Integration

### Hooks Architecture

-   **`useLighterSetup`**: Main hook for scene lifecycle and initialization
-   **`useLighter`**: Access to scene methods and undo/redo operations
-   **`useSceneSelectionState`**: Selection state management
-   **`usePixiRenderer`**: Renderer lifecycle
-   **`usePixiResourceLoader`**: Resource loader management
-   **`useLighterTooltipEventHandler`**: Tooltip event handling
-   **`useBridge`**: Integration with FiftyOne state management

### Component Pattern

```typescript
const LighterSampleRenderer = ({ sample, width, height, options }) => {
    // Setup the scene
    useLighterSetup(canvasRef, options);

    // Access scene functionality
    const { scene, isReady, addOverlay } = useLighter();
    const { selectedOverlayIds } = useSceneSelectionState(scene);

    // Sample loading and overlay creation
    // Event handling and UI controls
};
```

## Performance Considerations

### 1. Rendering Optimization

-   **Dirty Flag System**: Only re-render when overlays are dirty
-   **Element Reuse**: Update existing PixiJS elements instead of recreating
-   **Texture Caching**: PixiJS Assets manager for texture reuse
-   **Layered Rendering**: Separate containers for static and dynamic content
-   **Render Callbacks**: Before/after render phases for custom logic

### 2. Memory Management

-   **Disposal**: Overlay.destroy() and renderer.dispose()
-   **Weak References**: Event bus uses standard DOM event system
-   **AbortController**: Proper cleanup of event listeners

### 3. Interaction Performance

-   **Hit Testing**: Efficient bounds checking with element tracking
-   **Event Delegation**: Canvas-level event handling with overlay routing
-   **Selection Priority**: Quick resolution of overlapping overlays
-   **Overlay Ordering**: Smart ordering for interactive elements

## Extension Points

### 1. Custom Overlays

```typescript
class CustomOverlay extends BaseOverlay {
    render(renderer: Renderer2D, style: DrawStyle): void {
        // Custom rendering logic
    }
}

// Register with factory
overlayFactory.register("custom", (opts) => new CustomOverlay(opts));
```

### 2. Custom Renderers

```typescript
class CustomRenderer implements Renderer2D {
    // Implement all required methods
}
```

### 3. Plugin System

-   **PluginRegistry**: For registering custom overlays and renderers
-   **Event System**: For custom event types and handlers
-   **Factory Pattern**: For extensible overlay creation

**Note**: PluginRegistry is currently marked as unused and needs to be
integrated with FiftyOne plugins.
