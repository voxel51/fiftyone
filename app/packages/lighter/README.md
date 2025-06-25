# Lighter - Lightweight 2D/3D Rendering Engine

Lighter is an improvement on the existing rendering engine (looker).

## Architecture

```
Scene → Renderer → Overlay
```

### Core Components

-   **Scene**: Manages overlays, resources, and rendering lifecycle
-   **Renderer**: Provides drawing operations and manages render loop (2D or
    3D)
-   **Overlay**: Visual representation of data (image, bounding box,
    classification, etc.)

## Quick Start

### Basic Usage

```typescript
import {
    Scene2D,
    PixiRenderer2D,
    globalPixiResourceLoader,
    EventBus,
    OverlayFactory,
} from "@fiftyone/lighter";

const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);

const renderer = new PixiRenderer2D(canvas);
const resourceLoader = globalPixiResourceLoader;
const eventBus = new EventBus();

const scene = new Scene2D({
    canvas,
    renderer,
    resourceLoader,
    eventBus,
});

const boundingBox = overlayFactory.create("bounding-box", {
    bounds: { x: 100, y: 100, width: 200, height: 150 },
    style: { strokeStyle: "#ff0000", lineWidth: 2 },
    label: "person",
    confidence: 0.95,
});

scene.addOverlay(boundingBox);
```

### React Usage

```tsx
import { useLighter } from "@fiftyone/lighter/react";

function MyComponent() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { scene, isReady, addOverlay, clearOverlays, overlayFactory } =
        useLighter(canvasRef);

    const addBoundingBox = useCallback(() => {
        if (!isReady) return;

        const bbox = overlayFactory.create("bounding-box", {
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
        </div>
    );
}
```
