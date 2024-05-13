import { Box, BoxProps } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getComponentProps, getPath, getProps, spaceToHeight } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";

export default function GridView(props: ViewPropsType) {
  const { schema, path, data } = props;
  const { properties, view = {} } = schema as ObjectSchemaType;
  const { alignX, alignY, align_x, align_y, gap = 1, orientation } = view;
  const direction = orientation === "vertical" ? "row" : "column";

  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  const layoutHeight = props?.layout?.height;

  const baseGridProps: BoxProps = {
    sx: {
      display: "grid",
      gap,
      justifyContent: alignX || align_x || "start",
      alignItems: alignY || align_y || "start",
      gridAutoFlow: direction,
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
              justifySelf: alignX || align_x || "start",
              alignSelf: alignY || align_y || "start",
              maxHeight:
                orientation === "vertical"
                  ? spaceToHeight(space, layoutHeight)
                  : undefined,
            },
            key: id,
          };
          return (
            <Box
              key={id}
              {...getProps(
                { ...props, schema: property },
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
