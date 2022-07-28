import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import Map from "./Map";

export { default as Map } from "./Map";

registerComponent({
  name: "Map",
  label: "Map",
  component: Map,
  type: PluginComponentType.Plot,
  activator: hasGeoField,
});

function hasGeoField({ dataset }) {
  const field = dataset.sampleFields.find(
    (f) => f.embeddedDocType === "fiftyone.core.labels.GeoLocation"
  );

  return field !== undefined;
}
