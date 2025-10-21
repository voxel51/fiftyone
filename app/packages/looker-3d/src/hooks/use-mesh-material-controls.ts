import { folder, useControls } from "leva";
import { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { PANEL_ORDER_PCD_CONTROLS } from "../constants";
import { getThreeMaterialFromFo3dMaterial } from "../fo3d/utils";
import { avoidZFightingAtom } from "../state";
import type { FoMeshMaterial } from "./use-fo3d";

export const useMeshMaterialControls = (
  name: string,
  foMeshMaterial: FoMeshMaterial,
  omitColorControls = false
) => {
  const avoidZFighting = useRecoilValue(avoidZFightingAtom);
  const [opacity, setOpacity] = useState(foMeshMaterial.opacity);
  const [renderAsWireframe, setRenderAsWireframe] = useState(
    foMeshMaterial.wireframe
  );
  const [color, setColor] = useState(foMeshMaterial["color"] ?? "#ffffff");
  const [metalness, setMetalness] = useState(foMeshMaterial["metalness"] ?? 0);
  const [roughness, setRoughness] = useState(foMeshMaterial["roughness"] ?? 1);
  const [emissiveColor, setEmissiveColor] = useState(
    foMeshMaterial["emissive"] ?? "#000000"
  );
  const [emissiveIntensity, setEmissiveIntensity] = useState(
    foMeshMaterial["emissiveIntensity"] ?? 0.1
  );

  // note: we're not making attributes like reflectivity, IOR, etc. configurable
  const colorControls = useMemo(() => {
    if (omitColorControls) {
      return {};
    }
    return {
      color: {
        value: color,
        label: "Color",
        onChange: setColor,
        render: () => foMeshMaterial._type !== "MeshDepthMaterial",
        order: 1004,
      },
      metalness: {
        value: metalness,
        min: 0,
        max: 1,
        step: 0.1,
        label: "Metalness",
        onChange: setMetalness,
        render: () => foMeshMaterial._type === "MeshStandardMaterial",
        order: 1005,
      },
      roughness: {
        value: roughness,
        min: 0,
        max: 1,
        step: 0.1,
        label: "Roughness",
        onChange: setRoughness,
        render: () => foMeshMaterial._type === "MeshStandardMaterial",
        order: 1006,
      },
      emissiveIntensity: {
        value: emissiveIntensity,
        min: 0,
        max: 1,
        step: 0.1,
        label: "Emissive Intensity",
        onChange: setEmissiveIntensity,
        render: () =>
          foMeshMaterial._type !== "MeshDepthMaterial" &&
          foMeshMaterial._type !== "MeshBasicMaterial",
        order: 1007,
      },
      emissiveColor: {
        value: emissiveColor,
        label: "Emissive Color",
        onChange: setEmissiveColor,
        render: (get) => get(`${name}.emissiveIntensity`) > 0,
        order: 1008,
      },
    };
  }, [
    color,
    emissiveColor,
    emissiveIntensity,
    foMeshMaterial._type,
    metalness,
    roughness,
    name,
    omitColorControls,
  ]);

  useControls(
    () => ({
      [name]: folder(
        {
          materialTypeLabel: {
            value: omitColorControls ? "Custom" : foMeshMaterial._type,
            label: "Material Type",
            editable: false,
            order: -1,
          },
          opacity: {
            value: opacity,
            min: 0,
            max: 1,
            step: 0.1,
            onChange: setOpacity,
            label: "Opacity",
            order: 1000,
          },
          wireframe: {
            value: renderAsWireframe,
            label: "Wireframe",
            onChange: setRenderAsWireframe,
            order: 1002,
          },
          ...colorControls,
        },

        {
          order: PANEL_ORDER_PCD_CONTROLS,
          collapsed: true,
        }
      ),
    }),
    [
      omitColorControls,
      foMeshMaterial,
      opacity,
      renderAsWireframe,
      name,
      colorControls,
    ]
  );

  const material = useMemo(() => {
    return getThreeMaterialFromFo3dMaterial(
      {
        ...foMeshMaterial,
        opacity,
        wireframe: renderAsWireframe,
        color,
        metalness,
        roughness,
        emissiveColor,
        emissiveIntensity,
      },
      avoidZFighting
    );
  }, [
    foMeshMaterial,
    opacity,
    renderAsWireframe,
    color,
    metalness,
    roughness,
    emissiveColor,
    emissiveIntensity,
    avoidZFighting,
  ]);

  return {
    material,
  };
};
