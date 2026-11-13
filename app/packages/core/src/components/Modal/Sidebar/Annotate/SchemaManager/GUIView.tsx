/**
 * GUIView Component
 *
 * The Schema Manager's main view: the unified schema overview (one
 * layout for the dataset default and every custom schema, with its
 * own GUI/JSON switch in the header bar).
 */

import { scrollable } from "@fiftyone/components";
import SchemaOverview from "./SchemaOverview";
import { Container } from "./Components";

// =============================================================================
// Re-exports for backwards compatibility
// =============================================================================

export { useActivateFields, useDeactivateFields } from "./hooks";
export { selectedActiveFields, selectedHiddenFields } from "./state";

const GUIView = () => {
  return (
    <Container className={scrollable} style={{ marginTop: "1.5rem" }}>
      <SchemaOverview />
    </Container>
  );
};

export default GUIView;
