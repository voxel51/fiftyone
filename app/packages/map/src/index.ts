import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import { Schema } from "@fiftyone/utilities";
import Map from "./Map";
import MapIcon from "@mui/icons-material/Map";

export { default as Map } from "./Map";

registerComponent({
  name: "Map",
  label: "Map",
  component: Map,
  type: PluginComponentType.Plot,
  activator: hasGeoField,
  Icon: MapIcon,
});

function hasGeoField({ schema }: { schema: Schema }) {
  for (const name in schema) {
    if (schema[name].embeddedDocType === "fiftyone.core.labels.GeoLocation") {
      return true;
    }
  }
  return false;
}
