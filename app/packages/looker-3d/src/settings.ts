export type Looker3dSettings = {
  useLegacyCoordinates: boolean;
  defaultUp: THREE.Vector3Tuple;
  defaultCameraPosition: THREE.Vector3;
  pointCloud?: {
    minZ?: number;
  };
};

export const defaultPluginSettings: Partial<Looker3dSettings> = {
  useLegacyCoordinates: false,
  defaultUp: [0, 0, 1],
};
