import { Box, Grid } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getPath } from "../utils";
import DynamicIO from "./DynamicIO";

export default function TupleView(props) {
  const { onChange, path, schema, data, errors } = props;
  const { view = {}, items } = schema;

  return (
    <Box>
      <HeaderView {...props} divider />
      <Grid container spacing={1} xs={12}>
        {items.map((item, i) => {
          const itemSchema = item;
          const schemaView = item?.view || {};
          const itemView = view?.items?.[i] || {};
          const computedView = { ...schemaView, ...itemView };
          itemSchema.view = computedView;

          return (
            <Grid key={`${path}-${i}`} item xs={computedView.space || 12}>
              <DynamicIO
                schema={itemSchema}
                onChange={onChange}
                path={getPath(path, i)}
                data={data?.[i] ?? itemSchema?.default ?? schema?.default?.[i]}
                errors={errors}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
