import { Box, BoxProps } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import {
  getComponentProps,
  getMarginSx,
  getPaddingSx,
  getPath,
  getProps,
  spaceToHeight,
} from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";

export default function GridView(props: ViewPropsType) {
  const { schema, path, data } = props;
  const { properties, view = {} } = schema as ObjectSchemaType;
  const { alignX, alignY, align_x, align_y, gap = 1, orientation } = view;
  const direction = orientation === "horizontal" ? "row" : "column";

  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  const layoutHeight = props?.layout?.height;
  const parsedGap = parseGap(gap);
  const adjustedLayoutWidth = getAdjustedLayoutWidth(
    props?.layout?.width,
    parsedGap
  );

  const baseGridProps: BoxProps = {
    sx: {
      display: "flex",
      flexWrap: "wrap",
      gap: parsedGap,
      justifyContent: alignX || align_x || "start",
      alignItems: alignY || align_y || "start",
      flexDirection: direction,
      ...getPaddingSx(view),
      ...getMarginSx(view),
    },
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      <Box {...getProps(props, "grid", baseGridProps)}>
        {propertiesAsArray.map((property) => {
          const { id, view = {} } = property;
          const { alignX, alignY, align_x, align_y, space } = view;
          const itemPath = getPath(path, id);
          const baseItemProps: BoxProps = {
            sx: {
              justifySelf: alignX || align_x || "unset",
              alignSelf: alignY || align_y || "unset",
              maxHeight:
                orientation === "vertical"
                  ? spaceToHeight(space, layoutHeight)
                  : undefined,
              overflow: "hidden",
            },
            key: id,
          };
          return (
            <Box
              key={id}
              {...getProps(
                {
                  ...props,
                  schema: property,
                  layout: { width: adjustedLayoutWidth, height: layoutHeight },
                },
                "item",
                baseItemProps
              )}
            >
              <DynamicIO
                {...props}
                schema={property}
                path={itemPath}
                data={data?.[id]}
                parentSchema={schema}
                relativePath={id}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function parseGap(gap: number | string) {
  if (typeof gap === "string") {
    const gapStr = gap.trim().replace("px", "");
    if (isNaN(gapStr)) {
      console.warn("Ignored invalid gap value " + gap);
      return 0;
    }
    const gapInt = parseInt(gapStr);
    return gap.includes("px") ? gapInt / 8 : gapInt;
  } else if (typeof gap === "number") {
    return gap;
  }
  return 0;
}

function getAdjustedLayoutWidth(layoutWidth?: number, gap?: number) {
  if (typeof gap === "number" && typeof layoutWidth === "number") {
    return layoutWidth - gap * 8;
  }
  return layoutWidth;
}
