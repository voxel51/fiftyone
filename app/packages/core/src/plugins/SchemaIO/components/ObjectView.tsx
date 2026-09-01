import { Box, Grid } from "@mui/material";
import {
  Clickable,
  Collapsible,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { HeaderView } from ".";
import { getComponentProps, getErrorsForView, getPath } from "../utils";
import DynamicIO from "./DynamicIO";
import ErrorView from "./ErrorView";

export default function ObjectView(props) {
  const { schema, path, data } = props;
  const { properties, view = {} } = schema;
  const { collapsible, default_expanded: defaultExpanded, label } = view;

  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  const grid = (
    <Grid
      spacing={2}
      container
      sx={{ pl: 1 }}
      {...getComponentProps(props, "gridContainer")}
    >
      {propertiesAsArray.map((property) => {
        const space = property?.view?.space || 12;
        const { id } = property;
        return (
          <Grid
            key={id}
            item
            xs={space}
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
  );

  return (
    <Box {...getComponentProps(props, "container")}>
      {collapsible ? (
        // The trigger carries the label, so HeaderView is skipped here — it
        // would print the same heading a second time above the strip. Its
        // errors are rendered beside the trigger rather than lost with it.
        <Collapsible
          defaultOpen={Boolean(defaultExpanded)}
          header={({ open, toggle }) => (
            <>
              <Clickable
                onClick={toggle}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Icon
                  name={open ? IconName.ChevronBottom : IconName.ChevronRight}
                  size={Size.Sm}
                  color={TextColor.Secondary}
                />
                <Text variant={TextVariant.Md} color={TextColor.Fg}>
                  {label}
                </Text>
              </Clickable>
              <ErrorView schema={{}} data={getErrorsForView(props)} />
            </>
          )}
        >
          {grid}
        </Collapsible>
      ) : (
        <>
          <HeaderView {...props} divider nested />
          {grid}
        </>
      )}
    </Box>
  );
}
