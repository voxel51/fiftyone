/**
 * GUIView Component
 *
 * Main view for the Schema Manager with GUI and JSON tabs.
 */

import { Typography } from "@mui/material";
import { ToggleSwitch, Size } from "@voxel51/voodo";
import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import { activeSchemaTab, labelSchemasData } from "../state";
import ActiveFieldsSection from "./ActiveFieldsSection";
import { Container, Item } from "./Components";
import HiddenFieldsSection from "./HiddenFieldsSection";
import { useFullSchemaEditor } from "./hooks";
import { ContentArea } from "./styled";

// =============================================================================
// Re-exports for backwards compatibility
// =============================================================================

export { selectedActiveFields, selectedHiddenFields } from "./state";

export { useActivateFields, useDeactivateFields } from "./hooks";

// =============================================================================
// Tab IDs
// =============================================================================

const TAB_IDS = ["gui", "json"] as const;

// =============================================================================
// Content Components
// =============================================================================

/**
 * GUI content - field list with drag-drop
 */
const GUIContent = () => {
  return (
    <>
      <ActiveFieldsSection />
      <HiddenFieldsSection />
    </>
  );
};

/**
 * JSON content - raw schema view (read-only)
 */
const JSONContent = () => {
  const schemasData = useAtomValue(labelSchemasData);
  const { currentJson } = useFullSchemaEditor();

  if (!schemasData) {
    return (
      <Item style={{ justifyContent: "center", opacity: 0.7 }}>
        <Typography color="secondary">No schema data available</Typography>
      </Item>
    );
  }

  return (
    <ContentArea
      style={{
        position: "absolute",
        top: "50px",
        left: "2rem",
        right: "2rem",
        bottom: 0,
      }}
    >
      <CodeView
        data={currentJson}
        path="schemas"
        schema={{
          view: {
            language: "json",
            readOnly: true,
            width: "100%",
            height: "100%",
            componentsProps: {
              container: {
                style: { height: "100%" },
              },
            },
          },
        }}
      />
    </ContentArea>
  );
};

// =============================================================================
// Main Component
// =============================================================================

const GUIView = () => {
  const [activeTab, setActiveTab] = useAtom(activeSchemaTab);
  const defaultIndex = TAB_IDS.indexOf(activeTab);

  const handleTabChange = useCallback(
    (index: number) => {
      setActiveTab(TAB_IDS[index]);
    },
    [setActiveTab]
  );

  return (
    <Container style={{ marginBottom: "0.5rem" }}>
      <ToggleSwitch
        size={Size.Md}
        defaultIndex={defaultIndex}
        onChange={handleTabChange}
        tabs={[
          {
            id: "gui",
            data: {
              label: "GUI",
              content: <GUIContent />,
            },
          },
          {
            id: "json",
            data: {
              label: "JSON",
              content: <JSONContent />,
            },
          },
        ]}
      />
    </Container>
  );
};

export default GUIView;
