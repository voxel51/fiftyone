/**
 * GUIView Component
 *
 * Main view for the Schema Manager with GUI and JSON tabs.
 */

import { scrollable } from "@fiftyone/components";
import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { Size, Text, TextColor, ToggleSwitch } from "@voxel51/voodo";
import { useCallback } from "react";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import ActiveFieldsSection from "./ActiveFieldsSection";
import { Container, Item } from "./Components";
import { TAB_GUI, TAB_IDS, TAB_JSON } from "./constants";
import HiddenFieldsSection from "./HiddenFieldsSection";
import {
  useFullSchemaEditor,
  useLabelSchemasData,
  useSchemaEditorGUIJSONToggle,
  useSelectionCleanup,
} from "./hooks";
import { ContentArea } from "./styled";

// =============================================================================
// Re-exports for backwards compatibility
// =============================================================================

export { useActivateFields, useDeactivateFields } from "./hooks";
export { selectedActiveFields, selectedHiddenFields } from "./state";

// =============================================================================
// Content Components
// =============================================================================

/**
 * GUI content - field list with drag-drop
 */
const GUIContent = () => {
  // Reset selection when switching away from GUI tab
  useSelectionCleanup();

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
  const schemasData = useLabelSchemasData();
  const { currentJson } = useFullSchemaEditor();

  if (!schemasData) {
    return (
      <Item style={{ justifyContent: "center", opacity: 0.7 }}>
        <Text color={TextColor.Secondary}>No schema data available</Text>
      </Item>
    );
  }

  return (
    <ContentArea
      className={scrollable}
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
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });
  const { tab: activeTab, setTab: setActiveTab } =
    useSchemaEditorGUIJSONToggle();

  // Guard against invalid activeTab values (indexOf returns -1 for unknown values)
  const tabIndex = TAB_IDS.indexOf(activeTab);
  const defaultIndex = tabIndex === -1 ? 0 : tabIndex;

  const handleTabChange = useCallback(
    (index: number) => {
      const tabId = TAB_IDS[index];
      if (tabId) {
        setActiveTab(tabId);
      }
    },
    [setActiveTab]
  );

  // When M4 flag is off, show GUI content directly without toggle
  if (!isM4Enabled) {
    return (
      <Container className={scrollable} style={{ marginBottom: "0.5rem" }}>
        <GUIContent />
      </Container>
    );
  }

  return (
    <Container className={scrollable} style={{ marginBottom: "0.5rem" }}>
      <ToggleSwitch
        size={Size.Md}
        defaultIndex={defaultIndex}
        onChange={handleTabChange}
        tabs={[
          {
            id: TAB_GUI,
            data: {
              label: "GUI",
              content: <GUIContent />,
            },
          },
          {
            id: TAB_JSON,
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
