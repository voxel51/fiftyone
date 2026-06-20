import {
  EXPLORE,
  activeFields,
  datasetName,
  modalMode,
  useDisabledCheckboxPaths,
  useModalExplorEntries,
} from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { Suspense, lazy, useEffect } from "react";
import { useRecoilValue } from "recoil";
import ExploreSidebar from "../../Sidebar";
import { createExploreIsDisabled } from "../../Sidebar/InteractiveSidebar";
import SidebarContainer from "../../Sidebar/SidebarContainer";
import { exploreActiveFields } from "./Annotate/state";
import useCanAnnotate from "./Annotate/useCanAnnotate";
import useLoadSchemas from "./Annotate/useLoadSchemas";
import Mode from "./Mode";
import { useModalSidebarRenderEntry } from "./use-sidebar-render-entry";

// Heavy in-modal annotation tree; only fetched when an annotator actually
// switches the sample modal into annotate mode.
const Annotate = lazy(() => import("./Annotate"));

const Explore = () => {
  const renderEntry = useModalSidebarRenderEntry();
  const disabled = useDisabledCheckboxPaths();

  return (
    <ExploreSidebar
      isDisabled={createExploreIsDisabled(disabled)}
      render={renderEntry}
      useEntries={useModalExplorEntries}
      modal={true}
    />
  );
};

const Sidebar = () => {
  const mode = useAtomValue(modalMode);
  const { showAnnotationTab, disabledReason } = useCanAnnotate();
  const datasetNameValue = useRecoilValue(datasetName);
  const exploreFields = useRecoilValue(
    activeFields({ modal: true, expanded: false })
  );
  const setExploreFields = useSetAtom(exploreActiveFields);

  useEffect(() => {
    setExploreFields(exploreFields);
    return () => setExploreFields(null);
  }, [exploreFields, setExploreFields]);

  const loadSchemas = useLoadSchemas();

  // This effect loads schemas on init for valid annotation sessions
  useEffect(() => {
    if (datasetNameValue && showAnnotationTab && !disabledReason) {
      // Only load schemas if annotation is fully enabled (no disabled reason)
      // Also reload when dataset changes
      loadSchemas();
    }
  }, [showAnnotationTab, disabledReason, loadSchemas, datasetNameValue]);

  return (
    <SidebarContainer modal={true}>
      {showAnnotationTab && <Mode />}
      {mode === EXPLORE || !showAnnotationTab ? (
        <Explore />
      ) : (
        <Suspense fallback={null}>
          <Annotate disabledReason={disabledReason} loadSchemas={loadSchemas} />
        </Suspense>
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
