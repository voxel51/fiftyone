import { Box, BoxProps, SxProps } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import {
  getAdjustedLayoutWidth,
  getComponentProps,
  getMarginSx,
  getPaddingSx,
  getPath,
  getProps,
  parseGap,
  spaceToHeight,
} from "../utils";
import { ObjectSchemaType, SchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";

export default function FlexView(props: ViewPropsType) {
  const { schema, path, data, layout } = props;
  const { properties, view = {} } = schema as ObjectSchemaType;
  const { gap = 1, orientation } = view;

  const propertiesAsArray = Object.entries(properties).map(([id, property]) => {
    return { id, ...property };
  });
  const height = layout?.height as number;
  const parsedGap = parseGap(gap);
  const width = getAdjustedLayoutWidth(layout?.width, parsedGap) as number;
  const baseGridProps: BoxProps = {
    sx: {
      display: "flex",
      gap: parsedGap,
      ...getFlexPositionSx(view),
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
                  ? spaceToHeight(space, height)
                  : undefined,
            },
            key: id,
          };
          return (
            <Box
              key={id}
              {...getProps(
                { ...props, schema: property, layout: { width, height } },
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

function getFlexPositionSx(view: SchemaType["view"]) {
  const { alignX, alignY, align_x, align_y, orientation, wrap } = view;
  const direction = orientation === "horizontal" ? "row" : "column";
  const x = alignX || align_x || "left";
  const y = alignY || align_y || "left";
  const initialSx: SxProps = {
    justifyContent: direction === "row" ? ALIGN_MAP[x] : ALIGN_MAP[y],
    alignItems: direction === "column" ? ALIGN_MAP[x] : ALIGN_MAP[y],
  };
  if (wrap === false) {
    initialSx.flexDirection = direction;
    initialSx["& > div"] = { flexShrink: 0 };
  } else {
    initialSx.flexFlow = `${direction} wrap`;
  }
  return initialSx;
}

const ALIGN_MAP = {
  left: "flex-start",
  right: "flex-end",
  center: "safe center",
};
