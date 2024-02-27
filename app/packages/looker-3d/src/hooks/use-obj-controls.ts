import { folder, useControls } from "leva";
import { useMemo, useState } from "react";
import { PANEL_ORDER_PCD_CONTROLS } from "../constants";
import { getThreeMaterialFromFo3dMaterial } from "../fo3d/utils";
import { ObjAsset } from "./use-fo3d";

export const useMeshMaterialControls = (name: string, node: ObjAsset) => {
  const { defaultMaterial } = node;

  const [opacity, setOpacity] = useState(defaultMaterial.opacity);
  const [shouldUseVertexColors, setShouldUseVertexColors] = useState(
    defaultMaterial.vertexColors
  );
  const [renderAsWireframe, setRenderAsWireframe] = useState(
    defaultMaterial.wireframe
  );
  const [color, setColor] = useState(defaultMaterial["color"] ?? "#ffffff");

  // note: we're not making attributes like emissive color, reflectivity, IOR, etc. configurable

  useControls(
    () => ({
      [name]: folder(
        {
          materialTypeLabel: {
            value: defaultMaterial._type,
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
          vertexColors: {
            value: shouldUseVertexColors,
            label: "Vertex Colors",
            onChange: setShouldUseVertexColors,
            order: 1003,
          },
          color: {
            value: color,
            label: "Color",
            onChange: setColor,
            render: () => defaultMaterial._type !== "MeshDepthMaterial",
            order: 1004,
          },
        },
        {
          order: PANEL_ORDER_PCD_CONTROLS,
          collapsed: true,
        }
      ),
    }),
    [
      defaultMaterial,
      opacity,
      renderAsWireframe,
      color,
      shouldUseVertexColors,
      name,
    ]
  );

  const material = useMemo(() => {
    return getThreeMaterialFromFo3dMaterial({
      ...defaultMaterial,
      opacity,
      wireframe: renderAsWireframe,
      vertexColors: shouldUseVertexColors,
      color,
    });
  }, [
    defaultMaterial,
    opacity,
    renderAsWireframe,
    color,
    shouldUseVertexColors,
  ]);

  return {
    material,
  };
};
