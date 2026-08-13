import type { ReactNode } from "react";
import type { Texture } from "three";

/** Screen-space transform for an image fitted into a 2D panel. */
export interface ImageViewTransform {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

/** CSS-pixel dimensions shared by 2D panel layout helpers. */
export interface ImageDisplaySize {
  readonly height: number;
  readonly width: number;
}

/** CSS-pixel rect for an image displayed inside a panel. */
export interface ImageDisplayRect extends ImageDisplaySize {
  readonly x: number;
  readonly y: number;
}

/** Loaded Three.js texture plus image aspect ratio and disposal hook. */
export interface ImageTextureHandle {
  readonly aspectRatio: number;
  /** GPU-sampled range for a native single-channel depth texture. */
  readonly depthDisplay?: {
    readonly maxSampleValue: number | null;
    readonly minSampleValue: number | null;
  };
  /** Decoded texture-source bytes retained/uploaded by this handle. */
  readonly decodedByteLength?: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly dispose: () => void;
  /** False when the decoded source must be released after its final lease. */
  readonly retainWhenUnused?: boolean;
  readonly texture: Texture;
}

/** Cached unit-plane mesh that remaps displayed pixels into source texture UVs. */
export interface ImageTextureMesh {
  readonly displayHeight: number;
  readonly displayWidth: number;
  readonly indices: Uint32Array;
  /** Interleaved xyz positions in normalized image-plane coordinates. */
  readonly positions: Float32Array;
  /** Interleaved source-texture UV coordinates. */
  readonly uvs: Float32Array;
}

/** Props for the shared 2D visualization scene shell. */
export interface Base2dSceneProps {
  /** Set false when a shared stage clears the render target once per frame. */
  readonly background?: boolean;
  readonly children?: ReactNode;
}

/** Props for rendering an image texture into the 2D scene. */
export interface ImageTexturePlaneProps {
  readonly children?: ReactNode;
  readonly fit: "contain" | "cover";
  readonly textureMesh?: ImageTextureMesh | null;
  readonly textureHandle: ImageTextureHandle | null;
  readonly viewTransform?: ImageViewTransform;
}
