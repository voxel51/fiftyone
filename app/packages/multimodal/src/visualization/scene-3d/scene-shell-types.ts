import type { ReactNode } from "react";

type VectorTuple = readonly [number, number, number];

/** Controlled camera pose for shared 3D views. */
export interface ThreeCameraPose {
  readonly position: VectorTuple;
  readonly target: VectorTuple;
}

/** Scene backdrop fill used by the shared 3D shell. */
export type ThreeSceneBackground =
  | { readonly color: string; readonly kind: "solid" }
  | {
      readonly bottom: string;
      readonly kind: "gradient";
      readonly top: string;
    };

export type ThreeCameraPoseChangeSource = "focus" | "initial" | "interaction";
export type ThreeSceneUpAxis = "x" | "y" | "z";

/** Props for the shared 3D visualization scene shell. */
export interface Base3dSceneProps {
  /** Backdrop fill; defaults to the shared dark panel color. */
  readonly background?: ThreeSceneBackground;
  readonly cameraPose?: ThreeCameraPose | null;
  readonly children?: ReactNode;
  readonly focusSceneRequestKey?: number;
  readonly onCameraPoseChange?: (
    pose: ThreeCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
  readonly showGizmo?: boolean;
  /** World axis OrbitControls and the camera treat as up. @default "z" */
  readonly up?: ThreeSceneUpAxis;
}
