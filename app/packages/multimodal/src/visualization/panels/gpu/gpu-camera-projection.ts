import * as THREE from "three";
import * as TSL from "three/tsl";

const MIN_PROJECTABLE_DEPTH = 1e-6;
const MIN_RATIONAL_DENOMINATOR = 1e-6;

/** Direct homogeneous pinhole/rectified projection. */
export interface GpuPinholeCameraProjection {
  readonly kind: "pinhole";
  readonly projectionMatrix: THREE.Matrix4;
}

/** Original-image OpenCV rational-polynomial projection. */
export interface GpuRationalCameraProjection {
  readonly cameraMatrix: THREE.Matrix4;
  readonly distortionHigh: THREE.Vector4;
  readonly distortionLow: THREE.Vector4;
  readonly intrinsicsX: THREE.Vector4;
  readonly intrinsicsY: THREE.Vector4;
  readonly kind: "rational-polynomial";
  readonly maxRadius: number;
}

/** Original-image OpenCV equidistant/fisheye projection. */
export interface GpuEquidistantCameraProjection {
  readonly cameraMatrix: THREE.Matrix4;
  readonly distortion: THREE.Vector4;
  readonly intrinsicsX: THREE.Vector4;
  readonly intrinsicsY: THREE.Vector4;
  readonly kind: "equidistant";
  readonly maxTheta: number;
}

/** Immutable camera projection values consumed by visible and pick shaders. */
export type GpuCameraProjection =
  | GpuEquidistantCameraProjection
  | GpuPinholeCameraProjection
  | GpuRationalCameraProjection;

/** Shared projected pixel nodes produced from one sensor-position node. */
export interface GpuCameraProjectionNodes {
  readonly bindings: GpuCameraProjectionBindings;
  readonly depth: TSL.Node;
  readonly u: TSL.Node;
  readonly v: TSL.Node;
  readonly valid: TSL.Node;
}

interface GpuPinholeCameraProjectionBindings {
  readonly kind: "pinhole";
  readonly projectionMatrix: GpuProjectionUniformNode<THREE.Matrix4>;
}

interface GpuRationalCameraProjectionBindings {
  readonly cameraMatrix: GpuProjectionUniformNode<THREE.Matrix4>;
  readonly distortionHigh: GpuProjectionUniformNode<THREE.Vector4>;
  readonly distortionLow: GpuProjectionUniformNode<THREE.Vector4>;
  readonly intrinsicsX: GpuProjectionUniformNode<THREE.Vector4>;
  readonly intrinsicsY: GpuProjectionUniformNode<THREE.Vector4>;
  readonly kind: "rational-polynomial";
  readonly maxRadiusSquared: GpuProjectionUniformNode<number>;
}

interface GpuEquidistantCameraProjectionBindings {
  readonly cameraMatrix: GpuProjectionUniformNode<THREE.Matrix4>;
  readonly distortion: GpuProjectionUniformNode<THREE.Vector4>;
  readonly intrinsicsX: GpuProjectionUniformNode<THREE.Vector4>;
  readonly intrinsicsY: GpuProjectionUniformNode<THREE.Vector4>;
  readonly kind: "equidistant";
  readonly maxTheta: GpuProjectionUniformNode<number>;
}

/** Mutable shader uniforms for one compiled camera-model topology. */
export type GpuCameraProjectionBindings =
  | GpuEquidistantCameraProjectionBindings
  | GpuPinholeCameraProjectionBindings
  | GpuRationalCameraProjectionBindings;

interface GpuProjectionNode {
  readonly w: GpuProjectionNode;
  readonly x: GpuProjectionNode;
  readonly y: GpuProjectionNode;
  readonly z: GpuProjectionNode;
  add(value: GpuProjectionNode | number): GpuProjectionNode;
  div(value: GpuProjectionNode | number): GpuProjectionNode;
  mul(value: GpuProjectionNode | number): GpuProjectionNode;
  sub(value: GpuProjectionNode | number): GpuProjectionNode;
}

interface GpuProjectionUniformNode<T> extends GpuProjectionNode {
  value: T;
}

const cameraTsl = TSL as unknown as {
  abs(value: GpuProjectionNode): GpuProjectionNode;
  and(...conditions: readonly GpuProjectionNode[]): GpuProjectionNode;
  atan(y: GpuProjectionNode, x: GpuProjectionNode): GpuProjectionNode;
  greaterThan(
    left: GpuProjectionNode,
    right: GpuProjectionNode | number,
  ): GpuProjectionNode;
  lessThanEqual(
    left: GpuProjectionNode,
    right: GpuProjectionNode | number,
  ): GpuProjectionNode;
  select(
    condition: GpuProjectionNode,
    whenTrue: GpuProjectionNode | number,
    whenFalse: GpuProjectionNode | number,
  ): GpuProjectionNode;
  sqrt(value: GpuProjectionNode): GpuProjectionNode;
  uniform<T extends number | THREE.Matrix4 | THREE.Vector4>(
    value: T,
  ): GpuProjectionUniformNode<T>;
  vec4(...values: readonly (GpuProjectionNode | number)[]): GpuProjectionNode;
};

/**
 * Builds the canonical sensor-position to image-pixel node graph. Visible
 * projection and integer picking both call this function.
 */
export function createGpuCameraProjectionNodes(
  sensorPosition: TSL.Node,
  projection: GpuCameraProjection,
): GpuCameraProjectionNodes {
  const position = sensorPosition as unknown as GpuProjectionNode;
  if (projection.kind === "pinhole") {
    const projectionMatrix = cameraTsl.uniform(
      projection.projectionMatrix.clone(),
    );
    const homogeneous = projectionMatrix.mul(cameraTsl.vec4(position, 1));
    const depth = homogeneous.z;
    return {
      bindings: { kind: "pinhole", projectionMatrix },
      depth: depth as unknown as TSL.Node,
      u: homogeneous.x.div(depth) as unknown as TSL.Node,
      v: homogeneous.y.div(depth) as unknown as TSL.Node,
      valid: cameraTsl.greaterThan(
        depth,
        MIN_PROJECTABLE_DEPTH,
      ) as unknown as TSL.Node,
    };
  }

  const cameraMatrix = cameraTsl.uniform(projection.cameraMatrix.clone());
  const intrinsicsX = cameraTsl.uniform(projection.intrinsicsX.clone());
  const intrinsicsY = cameraTsl.uniform(projection.intrinsicsY.clone());
  const camera = cameraMatrix.mul(cameraTsl.vec4(position, 1));

  if (projection.kind === "rational-polynomial") {
    const distortionLow = cameraTsl.uniform(projection.distortionLow.clone());
    const distortionHigh = cameraTsl.uniform(projection.distortionHigh.clone());
    const maxRadiusSquared = cameraTsl.uniform(
      projection.maxRadius * projection.maxRadius,
    );
    const normalizedX = camera.x.div(camera.z);
    const normalizedY = camera.y.div(camera.z);
    const x2 = normalizedX.mul(normalizedX);
    const y2 = normalizedY.mul(normalizedY);
    const xy = normalizedX.mul(normalizedY);
    const r2 = x2.add(y2);
    const r4 = r2.mul(r2);
    const r6 = r4.mul(r2);
    const numerator = distortionLow.x
      .mul(r2)
      .add(distortionLow.y.mul(r4))
      .add(distortionHigh.x.mul(r6))
      .add(1);
    const denominator = distortionHigh.y
      .mul(r2)
      .add(distortionHigh.z.mul(r4))
      .add(distortionHigh.w.mul(r6))
      .add(1);
    const radial = numerator.div(denominator);
    const distortedX = normalizedX
      .mul(radial)
      .add(distortionLow.z.mul(xy).mul(2))
      .add(distortionLow.w.mul(r2.add(x2.mul(2))));
    const distortedY = normalizedY
      .mul(radial)
      .add(distortionLow.w.mul(xy).mul(2))
      .add(distortionLow.z.mul(r2.add(y2.mul(2))));
    return {
      bindings: {
        cameraMatrix,
        distortionHigh,
        distortionLow,
        intrinsicsX,
        intrinsicsY,
        kind: "rational-polynomial",
        maxRadiusSquared,
      },
      depth: camera.z as unknown as TSL.Node,
      u: applyIntrinsics(
        intrinsicsX,
        distortedX,
        distortedY,
      ) as unknown as TSL.Node,
      v: applyIntrinsics(
        intrinsicsY,
        distortedX,
        distortedY,
      ) as unknown as TSL.Node,
      valid: cameraTsl.and(
        cameraTsl.greaterThan(camera.z, MIN_PROJECTABLE_DEPTH),
        cameraTsl.lessThanEqual(r2, maxRadiusSquared),
        cameraTsl.greaterThan(
          cameraTsl.abs(denominator),
          MIN_RATIONAL_DENOMINATOR,
        ),
      ) as unknown as TSL.Node,
    };
  }

  const distortion = cameraTsl.uniform(projection.distortion.clone());
  const maxTheta = cameraTsl.uniform(projection.maxTheta);
  const radialSquared = camera.x.mul(camera.x).add(camera.y.mul(camera.y));
  const radialDistance = cameraTsl.sqrt(radialSquared);
  const rayLength = cameraTsl.sqrt(radialSquared.add(camera.z.mul(camera.z)));
  const theta = cameraTsl.atan(radialDistance, camera.z);
  const theta2 = theta.mul(theta);
  const theta4 = theta2.mul(theta2);
  const theta6 = theta4.mul(theta2);
  const theta8 = theta4.mul(theta4);
  const thetaDistorted = theta.mul(
    distortion.x
      .mul(theta2)
      .add(distortion.y.mul(theta4))
      .add(distortion.z.mul(theta6))
      .add(distortion.w.mul(theta8))
      .add(1),
  );
  const radialScale = cameraTsl.select(
    cameraTsl.greaterThan(radialDistance, MIN_PROJECTABLE_DEPTH),
    thetaDistorted.div(radialDistance),
    0,
  );
  const distortedX = camera.x.mul(radialScale);
  const distortedY = camera.y.mul(radialScale);
  return {
    bindings: {
      cameraMatrix,
      distortion,
      intrinsicsX,
      intrinsicsY,
      kind: "equidistant",
      maxTheta,
    },
    depth: rayLength as unknown as TSL.Node,
    u: applyIntrinsics(
      intrinsicsX,
      distortedX,
      distortedY,
    ) as unknown as TSL.Node,
    v: applyIntrinsics(
      intrinsicsY,
      distortedX,
      distortedY,
    ) as unknown as TSL.Node,
    valid: cameraTsl.and(
      cameraTsl.greaterThan(rayLength, MIN_PROJECTABLE_DEPTH),
      cameraTsl.lessThanEqual(theta, maxTheta),
    ) as unknown as TSL.Node,
  };
}

/** Updates camera-model uniforms when shader topology is unchanged. */
export function updateGpuCameraProjectionBindings(
  bindings: GpuCameraProjectionBindings,
  projection: GpuCameraProjection,
): boolean {
  if (bindings.kind !== projection.kind) {
    return false;
  }
  if (bindings.kind === "pinhole" && projection.kind === "pinhole") {
    bindings.projectionMatrix.value.copy(projection.projectionMatrix);
    return true;
  }
  if (
    bindings.kind === "rational-polynomial" &&
    projection.kind === "rational-polynomial"
  ) {
    bindings.cameraMatrix.value.copy(projection.cameraMatrix);
    bindings.distortionHigh.value.copy(projection.distortionHigh);
    bindings.distortionLow.value.copy(projection.distortionLow);
    bindings.intrinsicsX.value.copy(projection.intrinsicsX);
    bindings.intrinsicsY.value.copy(projection.intrinsicsY);
    bindings.maxRadiusSquared.value = projection.maxRadius ** 2;
    return true;
  }
  if (bindings.kind === "equidistant" && projection.kind === "equidistant") {
    bindings.cameraMatrix.value.copy(projection.cameraMatrix);
    bindings.distortion.value.copy(projection.distortion);
    bindings.intrinsicsX.value.copy(projection.intrinsicsX);
    bindings.intrinsicsY.value.copy(projection.intrinsicsY);
    bindings.maxTheta.value = projection.maxTheta;
    return true;
  }
  return false;
}

function applyIntrinsics(
  row: GpuProjectionNode,
  x: GpuProjectionNode,
  y: GpuProjectionNode,
): GpuProjectionNode {
  return row.x.mul(x).add(row.y.mul(y)).add(row.z);
}
