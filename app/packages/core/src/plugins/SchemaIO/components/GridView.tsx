import { Box, BoxProps } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import {
  getAdjustedLayoutWidth,
  getComponentProps,
  getGridSx,
  getPath,
  getProps,
  parseGap,
  spaceToHeight,
} from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";

export default function GridView(props: ViewPropsType) {
  const { schema, path, data } = props;
  const { properties, view = {} } = schema as ObjectSchemaType;
  const { gap = 1, orientation } = view;

  const propertiesAsArray = Object.entries(properties).map(([id, property]) => {
    return { id, ...property };
  });
  const height = props?.layout?.height as number;
  const parsedGap = parseGap(gap);
  const width = getAdjustedLayoutWidth(
    props?.layout?.width,
    parsedGap
  ) as number;

  const baseGridProps: BoxProps = {
    sx: { gap: parsedGap, ...getGridSx(view) },
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
              width: "100%",
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
                  layout: { width, height },
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
