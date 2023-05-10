import { Box, Grid } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getPath } from "../utils";
import DynamicIO from "./DynamicIO";

export default function ObjectView(props) {
  const { schema, path, data } = props;
  const { properties } = schema;

  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  return (
    <Box>
      <HeaderView {...props} divider />
      <Grid spacing={2} container sx={{ pl: 1 }}>
        {propertiesAsArray.map((property, i) => {
          const space = property?.view?.space || 12;
          return (
            <Grid key={property.id} item xs={space}>
              <DynamicIO
                {...props}
                schema={property}
                path={getPath(path, property.id)}
                data={data?.[property.id]}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
