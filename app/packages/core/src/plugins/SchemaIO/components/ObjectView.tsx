import React from "react";
import { Box, Grid } from "@mui/material";
import Header from "./Header";
import { getPath } from "../utils";
import DynamicIO from "./DynamicIO";

export default function ObjectView(props) {
  const { schema, onChange, path } = props;
  const { properties, view = {} } = schema;

  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  return (
    <Box>
      <Header {...view} divider />
      <Grid spacing={2} container>
        {propertiesAsArray.map((property, i) => {
          console.log({ property });
          const space = property?.view?.space || 12;
          return (
            <Grid key={property.id} item xs={space}>
              <DynamicIO
                schema={property}
                onChange={onChange}
                path={getPath(path, property.id)}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
