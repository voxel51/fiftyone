import { OrbitControls } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
import { WebGpuCanvas } from "../shared/WebGpuCanvas";
import type {
  Image2dOverlayPrimitive,
  Image2dOverlayPolyline,
  Image2dRenderableSource,
  Image2dViewProps,
} from "./types";

const ROOT_STYLES: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const CANVAS_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const OVERLAY_STYLES: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

type PlaneLayout = {
  imageWidth: number;
  imageHeight: number;
  planeWidth: number;
  planeHeight: number;
};

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
};

function TexturedImageControls({
  onCameraChange,
}: {
  onCameraChange?: () => void;
}) {
  return (
    <OrbitControls
      dampingFactor={0.08}
      enablePan
      enableRotate={false}
      enableZoom
      enableDamping
      makeDefault
      maxZoom={800}
      minZoom={20}
      onChange={onCameraChange}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      panSpeed={0.9}
      screenSpacePanning
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      zoomSpeed={0.9}
    />
  );
}

function getPlaneScale({
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  objectFit,
}: {
  imageWidth: number;
  imageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  objectFit: NonNullable<Image2dViewProps["objectFit"]>;
}) {
  const safeImageWidth = imageWidth || 1;
  const safeImageHeight = imageHeight || 1;
  const safeViewportWidth = viewportWidth || 1;
  const safeViewportHeight = viewportHeight || 1;
  const imageAspect = safeImageWidth / safeImageHeight;
  const viewportAspect = safeViewportWidth / safeViewportHeight;

  if (objectFit === "cover") {
    if (imageAspect > viewportAspect) {
      return {
        width: safeViewportHeight * imageAspect,
        height: safeViewportHeight,
      };
    }

    return {
      width: safeViewportWidth,
      height: safeViewportWidth / imageAspect,
    };
  }

  if (imageAspect > viewportAspect) {
    return {
      width: safeViewportWidth,
      height: safeViewportWidth / imageAspect,
    };
  }

  return {
    width: safeViewportHeight * imageAspect,
    height: safeViewportHeight,
  };
}

function projectPlanePoint(
  x: number,
  y: number,
  camera: THREE.Camera,
  size: { width: number; height: number }
) {
  const point = new THREE.Vector3(x, y, 0).project(camera);
  return {
    x: (point.x * 0.5 + 0.5) * size.width,
    y: (-point.y * 0.5 + 0.5) * size.height,
  };
}

function configureTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
}

function TexturedImagePlane({
  objectFit,
  onPlaneLayout,
  src,
}: {
  objectFit: NonNullable<Image2dViewProps["objectFit"]>;
  onPlaneLayout: (layout: PlaneLayout) => void;
  src: string;
}) {
  const texture = useLoader(THREE.TextureLoader, src);
  return (
    <TextureBackedImagePlane
      image={texture.image}
      objectFit={objectFit}
      onPlaneLayout={onPlaneLayout}
      texture={texture}
      textureKey={src}
    />
  );
}

function getRenderableImageDimensions(imageSource: Image2dRenderableSource) {
  if ("naturalWidth" in imageSource) {
    return {
      width: imageSource.naturalWidth || imageSource.width || 1,
      height: imageSource.naturalHeight || imageSource.height || 1,
    };
  }

  return {
    width: imageSource.width || 1,
    height: imageSource.height || 1,
  };
}

function TextureBackedImagePlane({
  image,
  objectFit,
  onPlaneLayout,
  texture,
  textureKey,
}: {
  image: {
    height?: number;
    naturalHeight?: number;
    naturalWidth?: number;
    width?: number;
  };
  objectFit: NonNullable<Image2dViewProps["objectFit"]>;
  onPlaneLayout: (layout: PlaneLayout) => void;
  texture: THREE.Texture;
  textureKey: string;
}) {
  const { invalidate, viewport } = useThree();
  const imageWidth = image.naturalWidth ?? image.width ?? 1;
  const imageHeight = image.naturalHeight ?? image.height ?? 1;

  React.useEffect(() => {
    configureTexture(texture);
    texture.needsUpdate = true;
    invalidate();
  }, [invalidate, texture, textureKey]);

  const planeScale = React.useMemo(() => {
    return getPlaneScale({
      imageWidth,
      imageHeight,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      objectFit,
    });
  }, [imageHeight, imageWidth, objectFit, viewport.height, viewport.width]);

  React.useEffect(() => {
    onPlaneLayout({
      imageWidth,
      imageHeight,
      planeWidth: planeScale.width,
      planeHeight: planeScale.height,
    });
  }, [
    imageHeight,
    imageWidth,
    onPlaneLayout,
    planeScale.height,
    planeScale.width,
    textureKey,
  ]);

  return (
    <mesh scale={[planeScale.width, planeScale.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} transparent />
    </mesh>
  );
}

function PredecodedImagePlane({
  imageSource,
  objectFit,
  onPlaneLayout,
  src,
}: {
  imageSource: Image2dRenderableSource;
  objectFit: NonNullable<Image2dViewProps["objectFit"]>;
  onPlaneLayout: (layout: PlaneLayout) => void;
  src: string;
}) {
  const texture = React.useMemo(() => {
    const nextTexture = new THREE.Texture();
    configureTexture(nextTexture);
    return nextTexture;
  }, []);

  React.useLayoutEffect(() => {
    texture.image = imageSource;
    texture.needsUpdate = true;
  }, [imageSource, texture]);

  React.useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  const dimensions = React.useMemo(
    () => getRenderableImageDimensions(imageSource),
    [imageSource]
  );

  return (
    <TextureBackedImagePlane
      image={{
        width: dimensions.width,
        height: dimensions.height,
      }}
      objectFit={objectFit}
      onPlaneLayout={onPlaneLayout}
      texture={texture}
      textureKey={src}
    />
  );
}

function OverlaySyncProbe({
  layout,
  onRectChange,
  syncRef,
}: {
  layout: PlaneLayout | null;
  onRectChange: (rect: OverlayRect) => void;
  syncRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { camera, size } = useThree();
  const lastRectRef = React.useRef<OverlayRect | null>(null);

  const syncRect = React.useCallback(() => {
    if (!layout) {
      return;
    }

    const topLeft = projectPlanePoint(
      -layout.planeWidth / 2,
      layout.planeHeight / 2,
      camera,
      size
    );
    const bottomRight = projectPlanePoint(
      layout.planeWidth / 2,
      -layout.planeHeight / 2,
      camera,
      size
    );

    const nextRect = {
      left: Math.min(topLeft.x, bottomRight.x),
      top: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
      imageWidth: layout.imageWidth,
      imageHeight: layout.imageHeight,
    };

    const previousRect = lastRectRef.current;
    const didChange =
      !previousRect ||
      Math.abs(previousRect.left - nextRect.left) > 0.5 ||
      Math.abs(previousRect.top - nextRect.top) > 0.5 ||
      Math.abs(previousRect.width - nextRect.width) > 0.5 ||
      Math.abs(previousRect.height - nextRect.height) > 0.5 ||
      previousRect.imageWidth !== nextRect.imageWidth ||
      previousRect.imageHeight !== nextRect.imageHeight;

    if (didChange) {
      lastRectRef.current = nextRect;
      onRectChange(nextRect);
    }
  }, [camera, layout, onRectChange, size]);

  React.useLayoutEffect(() => {
    syncRect();
  }, [syncRect]);

  React.useEffect(() => {
    syncRef.current = syncRect;

    return () => {
      syncRef.current = null;
    };
  }, [syncRect, syncRef]);

  useFrame(syncRect);

  return null;
}

function getOverlayBounds(overlays: Image2dOverlayPrimitive[]) {
  const points = overlays.flatMap((overlay) => {
    if (overlay.kind === "circle") {
      return [
        {
          x: overlay.center.x - overlay.radius,
          y: overlay.center.y - (overlay.radiusY ?? overlay.radius),
        },
        {
          x: overlay.center.x + overlay.radius,
          y: overlay.center.y + (overlay.radiusY ?? overlay.radius),
        },
      ];
    }

    if (overlay.kind === "points" || overlay.kind === "polyline") {
      return overlay.points;
    }

    return [overlay.position];
  });

  if (!points.length) {
    return {
      width: 1,
      height: 1,
    };
  }

  const maxX = Math.max(...points.map((point) => point.x), 1);
  const maxY = Math.max(...points.map((point) => point.y), 1);
  return {
    width: Math.ceil(maxX),
    height: Math.ceil(maxY),
  };
}

function getPolylineSegments(overlay: Image2dOverlayPolyline) {
  if (overlay.mode === "line-list") {
    const segments: Array<{
      start: Image2dOverlayPolyline["points"][number];
      end: Image2dOverlayPolyline["points"][number];
    }> = [];

    for (let index = 0; index < overlay.points.length; index += 2) {
      const start = overlay.points[index];
      const end = overlay.points[index + 1];
      if (!start || !end) {
        continue;
      }

      segments.push({ start, end });
    }

    return segments;
  }

  const segments: Array<{
    start: Image2dOverlayPolyline["points"][number];
    end: Image2dOverlayPolyline["points"][number];
  }> = [];

  for (let index = 0; index < overlay.points.length - 1; index += 1) {
    const start = overlay.points[index];
    const end = overlay.points[index + 1];
    if (!start || !end) {
      continue;
    }

    segments.push({ start, end });
  }

  if (overlay.closed && overlay.points.length > 1) {
    const start = overlay.points[overlay.points.length - 1];
    const end = overlay.points[0];
    if (start && end) {
      segments.push({ start, end });
    }
  }

  return segments;
}

function renderPolyline(overlay: Image2dOverlayPolyline) {
  const segments = getPolylineSegments(overlay);
  const shouldRenderPerSegmentColors =
    overlay.mode === "line-list" || Boolean(overlay.segmentColors?.length);

  if (shouldRenderPerSegmentColors) {
    return (
      <>
        {overlay.closed && overlay.fillColor ? (
          <polygon
            fill={overlay.fillColor}
            points={overlay.points
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            stroke="none"
          />
        ) : null}
        {segments.map((segment, index) => (
          <line
            key={`${overlay.id}:${index}`}
            x1={segment.start.x}
            x2={segment.end.x}
            y1={segment.start.y}
            y2={segment.end.y}
            stroke={
              overlay.segmentColors?.[index] ??
              overlay.strokeColor ??
              "rgba(255,255,255,1)"
            }
            strokeWidth={overlay.strokeWidth ?? 2}
          />
        ))}
      </>
    );
  }

  const points = overlay.points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  if (overlay.closed) {
    return (
      <polygon
        fill={overlay.fillColor ?? "transparent"}
        points={points}
        stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
        strokeWidth={overlay.strokeWidth ?? 2}
      />
    );
  }

  return (
    <polyline
      fill="none"
      points={points}
      stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
      strokeWidth={overlay.strokeWidth ?? 2}
    />
  );
}

function PointOverlayCircle({
  index,
  overlay,
  point,
}: {
  index: number;
  overlay: Extract<Image2dOverlayPrimitive, { kind: "points" }>;
  point: Extract<Image2dOverlayPrimitive, { kind: "points" }>["points"][number];
}) {
  const pointColor = overlay.pointColors?.[index] ?? null;

  return (
    <circle
      cx={point.x}
      cy={point.y}
      fill={pointColor ?? overlay.fillColor ?? overlay.strokeColor ?? "white"}
      r={overlay.pointRadius ?? 3}
      stroke={pointColor ?? overlay.strokeColor ?? "transparent"}
      strokeWidth={overlay.strokeWidth ?? 0}
    />
  );
}

function ImageOverlaySvg({
  overlays,
  rect,
  showTextOverlays,
}: {
  overlays: Image2dOverlayPrimitive[];
  rect: OverlayRect | null;
  showTextOverlays: boolean;
}) {
  if (!overlays.length) {
    return null;
  }

  const fallbackBounds = getOverlayBounds(overlays);
  const viewWidth = rect?.imageWidth ?? fallbackBounds.width;
  const viewHeight = rect?.imageHeight ?? fallbackBounds.height;

  return (
    <svg
      data-testid="image2d-overlay"
      preserveAspectRatio="none"
      style={{
        ...OVERLAY_STYLES,
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        width: rect?.width ?? "100%",
        height: rect?.height ?? "100%",
      }}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
    >
      {overlays.map((overlay) => {
        if (overlay.kind === "circle") {
          return (
            <ellipse
              key={overlay.id}
              cx={overlay.center.x}
              cy={overlay.center.y}
              fill={overlay.fillColor ?? "transparent"}
              rx={overlay.radius}
              ry={overlay.radiusY ?? overlay.radius}
              stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
              strokeWidth={overlay.strokeWidth ?? 2}
            />
          );
        }

        if (overlay.kind === "points") {
          return (
            <g key={overlay.id}>
              {overlay.points.map((point, index) => (
                <PointOverlayCircle
                  key={`${overlay.id}:${index}`}
                  index={index}
                  overlay={overlay}
                  point={point}
                />
              ))}
            </g>
          );
        }

        if (overlay.kind === "polyline") {
          return <g key={overlay.id}>{renderPolyline(overlay)}</g>;
        }

        if (!showTextOverlays) {
          return null;
        }

        const textWidth = Math.max(
          overlay.text.length * (overlay.fontSize ?? 14) * 0.6,
          28
        );
        const textHeight = Math.max((overlay.fontSize ?? 14) * 1.35, 18);

        return (
          <g
            key={overlay.id}
            transform={`translate(${overlay.position.x}, ${overlay.position.y})`}
          >
            <rect
              fill={overlay.backgroundColor ?? "rgba(11,18,29,0.84)"}
              height={textHeight}
              rx={3}
              ry={3}
              width={textWidth}
              x={-2}
              y={-textHeight + 4}
            />
            <text
              fill={overlay.textColor ?? "rgba(255,255,255,1)"}
              fontSize={overlay.fontSize ?? 14}
              x={2}
              y={0}
            >
              {overlay.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Renders a 2D MCAP image frame with projected annotation overlays. */
export function Image2dView({
  alt = "",
  frame,
  objectFit = "contain",
}: Image2dViewProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [planeLayout, setPlaneLayout] = React.useState<PlaneLayout | null>(
    null
  );
  const [overlayRect, setOverlayRect] = React.useState<OverlayRect | null>(
    null
  );
  const overlaySyncRef = React.useRef<(() => void) | null>(null);
  const handlePlaneLayout = React.useCallback((nextLayout: PlaneLayout) => {
    setPlaneLayout((currentLayout) => {
      if (
        currentLayout &&
        currentLayout.imageWidth === nextLayout.imageWidth &&
        currentLayout.imageHeight === nextLayout.imageHeight &&
        currentLayout.planeWidth === nextLayout.planeWidth &&
        currentLayout.planeHeight === nextLayout.planeHeight
      ) {
        return currentLayout;
      }

      return nextLayout;
    });
  }, []);

  if (!frame) {
    return null;
  }

  return (
    <div
      aria-label={alt || undefined}
      data-object-fit={objectFit}
      data-src={frame.src}
      data-testid="image2d-view"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      style={ROOT_STYLES}
    >
      <WebGpuCanvas
        camera={{ far: 1000, near: 0.1, position: [0, 0, 10], zoom: 100 }}
        frameloop="demand"
        orthographic
        style={CANVAS_STYLES}
      >
        <TexturedImageControls
          onCameraChange={() => overlaySyncRef.current?.()}
        />
        {frame.imageSource ? (
          <PredecodedImagePlane
            imageSource={frame.imageSource}
            objectFit={objectFit}
            onPlaneLayout={handlePlaneLayout}
            src={frame.src}
          />
        ) : (
          <TexturedImagePlane
            objectFit={objectFit}
            onPlaneLayout={handlePlaneLayout}
            src={frame.src}
          />
        )}
        <OverlaySyncProbe
          layout={planeLayout}
          onRectChange={setOverlayRect}
          syncRef={overlaySyncRef}
        />
      </WebGpuCanvas>
      <ImageOverlaySvg
        overlays={frame.overlays ?? []}
        rect={overlayRect}
        showTextOverlays={isHovered}
      />
    </div>
  );
}
