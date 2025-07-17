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
│  React Hooks (useLighter, useSceneSelectionState, etc.)        │
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
│                ├── ImageOverlay (CanonicalMedia)               │
│                ├── BoundingBoxOverlay (Spatial, Selectable)    │
│                ├── ClassificationOverlay (Selectable)          │
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
}
```

### 2. Event System

**Location**: `src/event/EventBus.ts`

**Design Pattern**: Observer Pattern with typed events

**Key Event Types**:

-   **Overlay Events**: `OVERLAY_ADDED`, `OVERLAY_REMOVED`, `OVERLAY_LOADED`
-   **Interaction Events**: `OVERLAY_CLICK`, `OVERLAY_DRAG_START`,
    `OVERLAY_HOVER`
-   **Selection Events**: `OVERLAY_SELECT`, `SELECTION_CHANGED`,
    `SELECTION_CLEARED`
-   **Spatial Events**: `SPATIAL_SHIFT`, `SPATIAL_RESIZE`, `SPATIAL_MOVE`
-   **System Events**: `RESIZE`, `CANONICAL_MEDIA_CHANGED`

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
    needsCoordinateUpdate(): boolean;
}

interface Selectable {
    isSelected(): boolean;
    setSelected(selected: boolean): void;
    getSelectionPriority(): number;
}

interface Movable {
    getPosition(): Point;
    setPosition(position: Point): void;
}
```

**Factory Pattern**: `OverlayFactory` for type-safe overlay creation

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

### 5. Interaction System

**Location**: `src/interaction/InteractionManager.ts`

**Responsibilities**:

-   Pointer event handling (down, move, up)
-   Drag state management
-   Click detection and double-click handling
-   Hover state management
-   Integration with selection system

### 6. Selection System

**Location**: `src/selection/SelectionManager.ts`

**Features**:

-   Multi-selection support (Ctrl/Cmd+click)
-   Selection priority for overlapping overlays
-   Programmatic selection API
-   Event emission for selection changes

**Selection Priority**:

-   Classifications: 15 (highest)
-   Bounding Boxes: 10 (medium)
-   Images: 5 (lowest)

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

### 9. Resource Management

**Location**: `src/resource/`

**Components**:

-   `ResourceLoader` interface
-   `PixiResourceLoader` implementation using PixiJS Assets
-   `globalPixiResourceLoader` singleton

**Features**:

-   Background loading with `loadBackground()`
-   Retry logic with exponential backoff
-   Asset type hints for optimization
-   Memory management with `unload()`

## Data Flow

### 1. Scene Initialization

```
React Component → useLighter → Scene2D → Managers → EventBus
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

-   **`useLighterWithPixi`**: Main hook for scene lifecycle
-   **`useSceneSelectionState`**: Selection state management
-   **`usePixiRenderer`**: Renderer lifecycle
-   **`usePixiResourceLoader`**: Resource loader management

### Component Pattern

```typescript
const LighterSampleRenderer = ({ sample, width, height }) => {
    const { scene, isReady, addOverlay } = useLighter(canvasRef);
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

### 2. Memory Management

-   **Proper Disposal**: Overlay.destroy() and renderer.dispose()
-   **Resource Cleanup**: Texture destruction and event listener removal
-   **Weak References**: Event bus uses standard DOM event system

### 3. Interaction Performance

-   **Hit Testing**: Efficient bounds checking with element tracking
-   **Event Delegation**: Canvas-level event handling with overlay routing
-   **Selection Priority**: Quick resolution of overlapping overlays

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

## Error Handling

### 1. Rendering Errors

-   **Status Management**: OVERLAY_STATUS_ERROR for failed renders
-   **Error Events**: OVERLAY_ERROR events for external handling
-   **Graceful Degradation**: Continue rendering other overlays

### 2. Resource Loading Errors

-   **Retry Logic**: Exponential backoff for network failures
-   **Fallback Loading**: Background loading with main thread fallback
-   **Error Events**: RESOURCE_ERROR events for user feedback

### 3. Interaction Errors

-   **Event Safety**: Try-catch blocks in event handlers
-   **State Recovery**: Proper cleanup on interaction failures
