import React from "react";
import { Box, Stack } from "@mui/material";
import { getPath } from "../utils";
import DynamicIO from "./DynamicIO";
import Header from "./Header";

export default function TuplesView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {}, items } = schema;

  return (
    <Box>
      <Header {...view} divider />
      <Stack spacing={1}>
        {items.map((item, i) => {
          const itemSchema = item;
          const schemaView = item?.view || {};
          const itemView = view?.items?.[i] || {};
          itemSchema.view = { ...schemaView, ...itemView };

          return (
            <DynamicIO
              key={`${path}-${i}`}
              schema={itemSchema}
              onChange={onChange}
              path={getPath(path, i)}
              data={data?.[i] ?? itemSchema?.default ?? schema?.default?.[i]}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
