export type Image2dOverlayPoint = {
  x: number;
  y: number;
};

export type Image2dOverlayCircle = {
  kind: "circle";
  id: string;
  center: Image2dOverlayPoint;
  radius: number;
  radiusY?: number;
  fillColor?: string | null;
  strokeColor?: string | null;
  strokeWidth?: number | null;
};

export type Image2dOverlayPoints = {
  kind: "points";
  id: string;
  points: Image2dOverlayPoint[];
  fillColor?: string | null;
  strokeColor?: string | null;
  strokeWidth?: number | null;
  pointRadius?: number | null;
};

export type Image2dOverlayPolyline = {
  kind: "polyline";
  id: string;
  points: Image2dOverlayPoint[];
  closed?: boolean;
  strokeColor?: string | null;
  fillColor?: string | null;
  strokeWidth?: number | null;
  mode?: "line-strip" | "line-loop" | "line-list";
};

export type Image2dOverlayText = {
  kind: "text";
  id: string;
  position: Image2dOverlayPoint;
  text: string;
  fontSize?: number | null;
  textColor?: string | null;
  backgroundColor?: string | null;
};

export type Image2dOverlayPrimitive =
  | Image2dOverlayCircle
  | Image2dOverlayPoints
  | Image2dOverlayPolyline
  | Image2dOverlayText;

/** Predecoded browser image source that can back a 2D playback texture. */
export type Image2dRenderableSource = HTMLImageElement | ImageBitmap;

/** One render-ready 2D image frame for a transport-agnostic archetype. */
export type Image2dFrame = {
  id: string;
  src: string;
  timestampNs: number;
  imageSource?: Image2dRenderableSource;
  overlays?: Image2dOverlayPrimitive[];
  warnings?: string[];
};

/** Visual props for the transport-agnostic `image2d` archetype. */
export type Image2dViewProps = {
  frame: Image2dFrame | null;
  alt?: string;
  objectFit?: "contain" | "cover";
};
