import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";

/**
 * e2e specs wait on the schema manager mounting and unmounting, and on a
 * fields section rendering its field rows
 */
type SchemaManagerE2EEvents = {
  "e2e:schema-manager:opened": undefined;
  "e2e:schema-manager:closed": undefined;
  "e2e:schema-manager:fields": {
    section: "active" | "hidden";
    paths: string;
  };
};

export const useSchemaManagerOpenSignal = () =>
  useEffect(() => {
    const bus = getEventBus<SchemaManagerE2EEvents>();
    bus.dispatch("e2e:schema-manager:opened");
    return () => bus.dispatch("e2e:schema-manager:closed");
  }, []);

export const useFieldsShownSignal = (
  section: "active" | "hidden",
  fields: string[],
) => {
  const paths = fields.join(",");
  useEffect(() => {
    getEventBus<SchemaManagerE2EEvents>().dispatch(
      "e2e:schema-manager:fields",
      { section, paths },
    );
  }, [section, paths]);
};
