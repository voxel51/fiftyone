import { Box, Grid } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import {
  getComponentProps,
  getLayoutProps,
  getPath,
  spaceToHeight,
} from "../utils";
import DynamicIO from "./DynamicIO";

export default function GridView(props) {
  const { schema, path, data } = props;
  const { properties, view = {} } = schema;
  const { alignX, alignY, align_x, align_y, gap = 1, orientation } = view;
  const direction = orientation === "vertical" ? "column" : "row";

  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  const layoutHeight = props?.layout?.height;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      <Grid
        container
        spacing={gap}
        direction={direction}
        justifyContent={alignX || align_x}
        alignItems={alignY || align_y}
        {...getLayoutProps(props)}
        {...getComponentProps(props, "gridContainer")}
      >
        {propertiesAsArray.map((property) => {
          const space = property?.view?.space || "auto";
          const { id } = property;
          return (
            <Grid
              key={id}
              item
              xs={space}
              {...getLayoutProps({ ...props, schema: property })}
              minHeight={
                orientation === "vertical"
                  ? spaceToHeight(space, layoutHeight)
                  : undefined
              }
              {...getComponentProps(props, "gridItem")}
            >
              <DynamicIO
                {...props}
                schema={property}
                path={getPath(path, id)}
                data={data?.[id]}
                parentSchema={schema}
                relativePath={id}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
