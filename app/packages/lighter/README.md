# Lighter - Lightweight 2D/3D Rendering Engine

A modern, lightweight rendering engine for 2D and 3D graphics with support for
both immediate and retained mode rendering, specifically designed for computer
vision dataset visualization.

## Architecture

Lighter follows a clean, layered architecture:

```
Scene → Renderer → Overlay
```

### Core Components

-   **Scene**: Manages overlays, resources, and rendering lifecycle
-   **Renderer**: Provides drawing operations and manages the render loop (2D
    or 3D)
-   **Overlay**: Visual representation of data (image, bounding box,
    classification, etc.)

### Key Design Principles

1. **Scene Ownership**: The Scene manages the overall rendering pipeline
2. **Renderer Responsibility**: The Renderer owns both drawing operations and
   render loop management
3. **Dependency Injection**: Overlays receive their renderer through dependency
   injection
4. **Factory Pattern**: Overlays are created using a factory pattern with
   runtime extensibility
5. **Clean Separation**: Each layer has a single responsibility
6. **Event-Driven**: Centralized event bus for communication between components

## Features

-   **Multi-renderer Support**: Canvas2D (immediate mode) and PixiJS (retained
    mode)
-   **2D/3D Rendering**: Extensible renderer system for different rendering
    dimensions
-   **Overlay System**: Rich overlay types with built-in support for bounding
    boxes, classifications, and more
-   **Event System**: Comprehensive event bus for overlay lifecycle and
    interactions
-   **Resource Management**: Async resource loading with retry logic
-   **Undo/Redo**: Built-in undo/redo system for overlay operations
-   **Plugin Registry**: Runtime extensibility for custom overlay types
-   **TypeScript**: Full TypeScript support with comprehensive type definitions
-   **Performance Optimizations**: Advanced PixiJS optimizations for
    high-performance rendering
-   **React Integration**: Complete React components and hooks for easy
    integration

## React Integration

Lighter provides a complete React integration with components and hooks for
easy use in React applications.

### React Components

#### `LighterViewer`

The main React component for rendering 2D scenes:

```tsx
import { LighterViewer } from "@fiftyone/lighter/react";

function MyComponent() {
    const handleOverlayLoaded = (overlayId: string) => {
        console.log("Overlay loaded:", overlayId);
    };

    return (
        <LighterViewer
            width={800}
            height={600}
            enablePerformanceMonitoring={true}
            onOverlayLoaded={handleOverlayLoaded}
        />
    );
}
```

#### `AdvancedLighterViewer`

A more advanced component with built-in controls:

```tsx
import { AdvancedLighterViewer } from "@fiftyone/lighter/react";

function MyComponent() {
    return (
        <AdvancedLighterViewer
            width={1000}
            height={700}
            enablePerformanceMonitoring={true}
        />
    );
}
```

#### `HookBasedViewer`

A simple component demonstrating hook usage:

```tsx
import { HookBasedViewer } from "@fiftyone/lighter/react";

function MyComponent() {
    return <HookBasedViewer width={600} height={400} className="my-viewer" />;
}
```

### React Hooks

#### `useLighter`

A custom hook for direct control over the Lighter scene:

```tsx
import { useLighter } from "@fiftyone/lighter/react";
import { BoundingBoxOverlay } from "@fiftyone/lighter";

function MyComponent() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const {
        scene,
        isReady,
        overlayCount,
        addOverlay,
        removeOverlay,
        clearOverlays,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useLighter(canvasRef);

    const addBoundingBox = useCallback(() => {
        if (!isReady) return;

        const bbox = new BoundingBoxOverlay({
            bounds: { x: 100, y: 100, width: 200, height: 150 },
            style: { strokeStyle: "#ff0000", lineWidth: 2 },
            label: "person",
        });

        addOverlay(bbox);
    }, [addOverlay, isReady]);

    return (
        <div>
            <canvas ref={canvasRef} width={600} height={400} />
            <button onClick={addBoundingBox} disabled={!isReady}>
                Add BBox
            </button>
            <button onClick={clearOverlays} disabled={!isReady}>
                Clear All
            </button>
            <span>Overlays: {overlayCount}</span>
        </div>
    );
}
```

### Using Refs

You can use refs to control the LighterViewer programmatically:

```tsx
import { LighterViewer, type LighterViewerRef } from "@fiftyone/lighter/react";
import { BoundingBoxOverlay } from "@fiftyone/lighter";

function MyComponent() {
    const viewerRef = useRef<LighterViewerRef>(null);

    const addOverlay = useCallback(() => {
        if (!viewerRef.current) return;

        const bbox = new BoundingBoxOverlay({
            bounds: { x: 100, y: 100, width: 200, height: 150 },
            style: { strokeStyle: "#ff0000", lineWidth: 2 },
            label: "person",
        });

        viewerRef.current.addOverlay(bbox);
    }, []);

    const clearAll = useCallback(() => {
        viewerRef.current?.clearOverlays();
    }, []);

    return (
        <div>
            <LighterViewer
                ref={viewerRef}
                width={800}
                height={600}
                enablePerformanceMonitoring={true}
            />
            <button onClick={addOverlay}>Add Overlay</button>
            <button onClick={clearAll}>Clear All</button>
        </div>
    );
}
```

### Component Props

#### `LighterViewerProps`

```tsx
interface LighterViewerProps {
    /** Width of the canvas */
    width?: number;
    /** Height of the canvas */
    height?: number;
    /** Initial overlays to display */
    initialOverlays?: Array<{
        type: "bounding-box" | "classification";
        data: any;
    }>;
    /** Callback when overlays are loaded */
    onOverlayLoaded?: (overlayId: string) => void;
    /** Callback when scene is ready */
    onSceneReady?: (scene: Scene2D) => void;
    /** Enable performance monitoring */
    enablePerformanceMonitoring?: boolean;
    /** Custom CSS class name */
    className?: string;
}
```

#### `LighterViewerRef`

```tsx
interface LighterViewerRef {
    addOverlay: (overlay: BoundingBoxOverlay | ClassificationOverlay) => void;
    removeOverlay: (id: string) => void;
    clearOverlays: () => void;
    undo: () => void;
    redo: () => void;
    scene: Scene2D | null;
}
```

## PixiJS Performance Optimizations

The PixiJS v8 renderer includes several performance optimizations based on
[PixiJS v8 best practices](https://pixijs.com/8.x/guides/concepts/performance-tips):

### 1. **Async Initialization**

-   PixiJS v8 requires async initialization for WebGPU support
-   Automatic initialization handling in the renderer
-   Proper error handling for initialization failures

### 2. **Efficient Graphics Creation**

-   Direct graphics creation for each drawing operation
-   Optimized for PixiJS v8's new graphics API
-   Proper cleanup and memory management

### 3. **Text Rendering Optimizations**

-   Uses PixiJS v8's new Text constructor API
-   Efficient text style management
-   Background rendering for better readability

### 4. **Cache as Texture**

-   Static overlays can be cached as textures using `cacheAsTexture()`
-   Dramatically reduces rendering overhead for unchanging elements
-   Trades memory for performance (use judiciously)

### 5. **Container Management**

-   Efficient container hierarchy for different element types
-   Separate containers for graphics and text elements
-   Proper cleanup and memory management

### 6. **Event System Integration**

-   Full integration with PixiJS v8's event system
-   Proper ticker usage with v8 API
-   Performance monitoring capabilities

### 7. **Memory Management**

-   Proper cleanup of PixiJS objects
-   Efficient container management
-   Automatic texture garbage collection

### 8. **TypeScript Support**

-   Full TypeScript support for PixiJS v8
-   Proper type definitions and interfaces
-   Compile-time error checking

## Quick Start

### Installation

```bash
npm install @fiftyone/lighter
```

### Basic Usage

```typescript
import {
    Scene2D,
    PixiRenderer2D,
    PixiResourceLoader,
    EventBus,
    BoundingBoxOverlay,
} from "@fiftyone/lighter";

// Create canvas element
const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);

// Create scene components
const renderer = new PixiRenderer2D(canvas);
const resourceLoader = new PixiResourceLoader();
const eventBus = new EventBus();

// Create scene
const scene = new Scene2D({
    canvas,
    renderer,
    resourceLoader,
    eventBus,
});

// Listen for events
eventBus.on("overlay-loaded", (event) => {
    console.log("Overlay loaded:", event.detail.id);
});

// Add a bounding box overlay
const boundingBox = new BoundingBoxOverlay({
    bounds: { x: 100, y: 100, width: 200, height: 150 },
    style: { strokeStyle: "#ff0000", lineWidth: 2 },
    label: "person",
    confidence: 0.95,
});

scene.addOverlay(boundingBox);
```

### React Usage

```tsx
import { LighterViewer } from "@fiftyone/lighter/react";

function App() {
    return (
        <LighterViewer
            width={800}
            height={600}
            enablePerformanceMonitoring={true}
            onOverlayLoaded={(id) => console.log("Overlay loaded:", id)}
        />
    );
}
```

### Performance Optimization Example

```typescript
import { createOptimizedScene } from "@fiftyone/lighter/examples/pixi-optimizations";

const canvas = document.createElement("canvas");
canvas.width = 1200;
canvas.height = 800;
document.body.appendChild(canvas);

// Create optimized scene with performance monitoring
const { scene, renderer, cleanup } = createOptimizedScene(canvas);

// Access advanced PixiJS features
const pixiApp = renderer.getPixiApp();
const stage = renderer.getStage();

// Enable additional optimizations
if (pixiApp.renderer) {
    pixiApp.renderer.cull = true; // Enable culling
}

// Cache static overlays as bitmaps
const overlays = scene.getAllOverlays();
overlays.forEach((overlay) => {
    const container = renderer.getOverlayContainer(overlay.id);
    if (container) {
        renderer.cacheAsBitmap(container);
    }
});
```

### Using Different Renderers

```typescript
// PixiJS (retained mode) - Recommended for performance
const pixiRenderer = new PixiRenderer2D(canvas);

// Create scene with renderer
const scene = new Scene2D({
    canvas,
    renderer: pixiRenderer,
    resourceLoader,
    eventBus,
});
```

## Architecture Details

### Scene Layer

The Scene is the top-level component that:

-   Manages overlay lifecycle
-   Handles resource loading
-   Provides undo/redo functionality
-   Coordinates with the renderer

```typescript
class Scene2D {
    private overlays = new Map<string, BaseOverlay>();
    private undoRedo = new UndoRedoManager();

    constructor(config: Scene2DConfig) {
        this.config.renderer.startRenderLoop(() => this.renderFrame());
    }

    addOverlay(overlay: BaseOverlay): void {
        overlay.setRenderer(this.config.renderer);
        overlay.attachEventBus(this.config.eventBus);
        this.overlays.set(overlay.id, overlay);
        this.config.renderer.addOverlay(overlay);
    }
}
```

### Renderer Layer

The Renderer provides both drawing operations and render loop management:

```typescript
interface Renderer2D {
    // Overlay management
    addOverlay(overlay: BaseOverlay): void;
    removeOverlay(id: string): void;

    // Render loop
    startRenderLoop(onFrame: () => void): void;
    stopRenderLoop(): void;

    // Drawing methods
    drawRect(bounds: Rect, style: DrawStyle): void;
    drawText(text: string, position: Point, options?: TextOptions): void;
    drawLine(start: Point, end: Point, style: DrawStyle): void;
    drawCircle(center: Point, radius: number, style: DrawStyle): void;
    clear(): void;
}
```

### Overlay System

Overlays receive their renderer through dependency injection:

```typescript
class BoundingBoxOverlay implements BaseOverlay {
    private renderer?: Renderer2D;

    setRenderer(renderer: Renderer2D): void {
        this.renderer = renderer;
    }

    render(renderer: Renderer2D): void {
        renderer.drawRect(this.bounds, this.style);
    }
}
```

## Event System

Lighter uses a centralized event bus for communication:

```typescript
// Event types
type OverlayEvent =
    | { type: "overlay-loaded"; detail: { id: string } }
    | { type: "overlay-error"; detail: { id: string; error: Error } }
    | { type: "annotation-added"; detail: { id: string; annotation: any } }
    | { type: "undo"; detail: { commandId: string } }
    | { type: "redo"; detail: { commandId: string } };

// Listen for events
eventBus.on("overlay-loaded", (event) => {
    console.log("Overlay loaded:", event.detail.id);
});

// Emit events
eventBus.emit({
    type: "overlay-loaded",
    detail: { id: "overlay-1" },
});
```

## Undo/Redo System

Lighter provides a built-in undo/redo system:

```typescript
// Execute commands
scene.executeCommand(new AddOverlayCommand(overlay));

// Undo/Redo
scene.undo();
scene.redo();

// Check availability
if (scene.canUndo()) {
    scene.undo();
}
```

## Plugin System

Extend overlay types at runtime:

```typescript
import { OverlayFactory, PluginRegistry } from "@fiftyone/lighter";

const factory = new OverlayFactory();
const registry = new PluginRegistry(factory);

// Register custom overlay type
registry.registerOverlay("custom-overlay", (opts) => new CustomOverlay(opts));

// Create using factory
const overlay = factory.create("custom-overlay", {
    /* options */
});
```

## Testing

Run the test suite:

```bash
npm test
npm run test:watch
```

## Development

```bash
# Install dependencies
npm install

# Type checking
npm run type-check

# Build
npm run build

# Lint
npm run lint
```

## Performance Guidelines

### For Large Datasets (>1000 overlays)

1. **Use ParticleContainer**: For many similar objects
2. **Enable Culling**: Set `pixiApp.renderer.cull = true`
3. **Cache Static Elements**: Use `cacheAsBitmap()` for unchanging overlays
4. **Batch Creation**: Create overlays in batches to avoid blocking
5. **Monitor FPS**: Use the performance monitoring features

### For Real-time Updates

1. **Avoid Cache as Bitmap**: For frequently changing overlays
2. **Use Shared Geometries**: Leverage the built-in geometry reuse
3. **Minimize Transform Updates**: Batch transform changes
4. **Use Efficient Containers**: Separate static and dynamic elements

### Memory Management

1. **Clean Up Resources**: Call `scene.destroy()` when done
2. **Monitor Memory Usage**: Use browser dev tools
3. **Limit Cache Usage**: Be judicious with `cacheAsBitmap`
4. **Use Texture Atlases**: For many similar textures

## Benefits of This Architecture

### 1. **Simplified Ownership Hierarchy**

-   Scene manages overlays and coordinates with renderer
-   Renderer owns both drawing operations and render loop
-   Clear responsibility boundaries

### 2. **Dependency Injection**

-   Overlays receive renderers through DI
-   Easy to test and mock
-   Loose coupling between components

### 3. **Factory Pattern**

-   Overlays created using factory pattern
-   Easy to extend with custom overlays
-   Consistent creation pattern

### 4. **Separation of Concerns**

-   Scene: High-level management
-   Renderer: Drawing operations and render loop
-   Overlay: Visual representation

### 5. **Event-Driven Communication**

-   Decoupled components
-   Easy to extend with new event types
-   Centralized event handling

### 6. **Runtime Extensibility**

-   Plugin registry for custom overlays
-   Factory pattern for overlay creation
-   No need to modify core code for extensions

### 7. **Performance Optimized**

-   PixiJS best practices built-in
-   Shared geometries and efficient batching
-   Advanced optimization features available

### 8. **React Integration**

-   Complete React components and hooks
-   TypeScript support for all React APIs
-   Easy integration with existing React applications

## License

Apache 2.0
