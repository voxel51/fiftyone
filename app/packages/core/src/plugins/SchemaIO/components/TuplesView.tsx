import React from "react";
import { Box, Stack } from "@mui/material";
import { getPath } from "../utils";
import DynamicIO from "./DynamicIO";
import Header from "./Header";

export default function TuplesView(props) {
  const { onChange, path, schema } = props;
  const { view = {}, items } = schema;

  return (
    <Box>
      <Header {...view} divider />
      <Stack spacing={1}>
        {items.map((item, i) => {
          const schema = item;
          const schemaView = item?.view || {};
          const itemView = view?.items?.[i] || {};
          schema.view = { ...schemaView, ...itemView };

          return (
            <DynamicIO
              key={`${path}-${i}`}
              schema={schema}
              onChange={onChange}
              path={getPath(path, i)}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
