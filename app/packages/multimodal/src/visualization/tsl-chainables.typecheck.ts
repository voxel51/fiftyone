import type * as TSL from "three/tsl";

import type {
  CameraProjectionTslFacade,
  ImageAnnotationPickTslFacade,
  ImageAnnotationTslFacade,
  PointCloud3dPickTslFacade,
  PointCloudChannelTslFacade,
  PointCloudColorTslFacade,
  PointCloudPositionTslFacade,
  PointCloudProjectionPickTslFacade,
  PointCloudProjectionTslFacade,
  PointCloudSpriteTslFacade,
} from "./tsl-chainables";

type Property<Value, Key extends keyof Value> = Value[Key];
type Returns<Value, Key extends keyof Value> = Value[Key] extends (
  ...args: never[]
) => infer Result
  ? Result
  : never;
type Supports<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;
type Rejects<Value, Key extends PropertyKey> = Key extends keyof Value
  ? false
  : true;
type Expect<Condition extends true> = Condition;
type IsNode<Value> = Value extends TSL.Node ? true : false;

type AnnotationUv = Returns<ImageAnnotationTslFacade, "uv">;
type AnnotationDistance = Returns<Returns<AnnotationUv, "sub">, "length">;

type AnnotationPickIndex = Property<
  ImageAnnotationPickTslFacade,
  "instanceIndex"
>;
type AnnotationPickMinimum = Returns<
  Returns<AnnotationPickIndex, "add">,
  "min"
>;

type CameraVector = Returns<CameraProjectionTslFacade, "vec4">;
type CameraRatio = Returns<Returns<CameraVector, "mul">, "div">;

type ProjectionUv = Returns<PointCloudProjectionTslFacade, "uv">;
type ProjectionDistance = Returns<Returns<ProjectionUv, "sub">, "length">;

type ProjectionPickIndex = Property<
  PointCloudProjectionPickTslFacade,
  "instanceIndex"
>;
type ProjectionPickProduct = Returns<
  Returns<ProjectionPickIndex, "add">,
  "mul"
>;

type PointCloud3dVector = Returns<PointCloud3dPickTslFacade, "vec4">;
type PointCloud3dDot = Returns<Property<PointCloud3dVector, "xyz">, "dot">;

type PointCloudColorVector = Returns<PointCloudColorTslFacade, "vec3">;
type PointCloudColorProduct = Returns<PointCloudColorVector, "mul">;

type PointCloudPositionStorage = Returns<
  PointCloudPositionTslFacade,
  "storage"
>;
type PointCloudPosition = Returns<PointCloudPositionStorage, "element">;
type PointCloudPositionDot = Returns<PointCloudPosition, "dot">;

type PointCloudChannelStorage = Returns<PointCloudChannelTslFacade, "storage">;
type PointCloudChannel = Returns<PointCloudChannelStorage, "element">;
type PointCloudChannelShift = Returns<PointCloudChannel, "shiftRight">;

type PointCloudSpriteUv = Returns<PointCloudSpriteTslFacade, "uv">;
type PointCloudSpriteDistance = Returns<
  Returns<PointCloudSpriteUv, "sub">,
  "length"
>;
type PointCloudSpriteOutside = Returns<PointCloudSpriteDistance, "greaterThan">;

/**
 * Positive and negative compile-time fixtures for every domain facade.
 * A newly exposed cross-domain operator flips one of the `Rejects` entries
 * to false and fails package typechecking.
 */
export type TslChainableContractFixtures = readonly [
  Expect<IsNode<AnnotationDistance>>,
  Expect<Rejects<AnnotationDistance, "bitAnd">>,
  Expect<IsNode<AnnotationPickMinimum>>,
  Expect<Rejects<AnnotationPickMinimum, "atan">>,
  Expect<IsNode<CameraRatio>>,
  Expect<Rejects<CameraRatio, "length">>,
  Expect<IsNode<ProjectionDistance>>,
  Expect<Rejects<ProjectionDistance, "bitAnd">>,
  Expect<IsNode<ProjectionPickProduct>>,
  Expect<Rejects<ProjectionPickProduct, "length">>,
  Expect<IsNode<PointCloud3dDot>>,
  Expect<Rejects<PointCloud3dDot, "shiftRight">>,
  Expect<IsNode<PointCloudColorProduct>>,
  Expect<Rejects<PointCloudColorProduct, "length">>,
  Expect<IsNode<PointCloudPositionDot>>,
  Expect<Rejects<PointCloudPositionDot, "bitAnd">>,
  Expect<IsNode<PointCloudChannelShift>>,
  Expect<Rejects<PointCloudChannelShift, "length">>,
  Expect<IsNode<PointCloudSpriteOutside>>,
  Expect<Rejects<PointCloudSpriteOutside, "bitAnd">>,
  Expect<Supports<PointCloudColorVector, "rgb">>,
];
