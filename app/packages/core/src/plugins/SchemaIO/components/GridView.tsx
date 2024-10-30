import { Box, BoxProps } from "@mui/material";
import { HeaderView } from ".";
import {
  getAdjustedLayoutDimensions,
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

  const parsedGap = parseGap(gap);
  const { height, width } = getAdjustedLayoutDimensions({
    height: props?.layout?.height,
    width: props?.layout?.width,
    gap: parsedGap,
    orientation,
  });

  const baseGridProps: BoxProps = {
    sx: {
      width: "100%",
      boxSizing: "border-box",
      gap: parsedGap,
      ...getGridSx(view),
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
              width: "100%", // Ensure each child takes full width
              boxSizing: "border-box", // Include borders in width calculation
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
