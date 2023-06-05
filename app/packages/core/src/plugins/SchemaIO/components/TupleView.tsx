import { Box, Grid } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getComponentProps, getPath } from "../utils";
import DynamicIO from "./DynamicIO";

export default function TuplesView(props) {
  const { path, schema, data } = props;
  const { view = {}, items } = schema;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      <Grid
        container
        spacing={1}
        xs={12}
        {...getComponentProps(props, "itemsContainer")}
      >
        {items.map((item, i) => {
          const itemSchema = item;
          const schemaView = item?.view || {};
          const itemView = view?.items?.[i] || {};
          const computedView = { ...schemaView, ...itemView };
          itemSchema.view = computedView;

          return (
            <Grid
              key={`${path}-${i}`}
              item
              xs={computedView.space || 12}
              {...getComponentProps(props, "itemContainer")}
            >
              <DynamicIO
                {...props}
                schema={itemSchema}
                path={getPath(path, i)}
                data={data?.[i] ?? itemSchema?.default ?? schema?.default?.[i]}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
