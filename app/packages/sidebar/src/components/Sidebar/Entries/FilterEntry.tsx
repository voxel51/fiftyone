import {
  cssVar,
  FilterAltIcon,
  Text as VoodoText,
  TextColor,
  TextVariant,
  Tooltip,
  VisibilityIcon,
  VisibilityOffIcon,
} from "@voxel51/voodo";
import { getEventBus } from "@fiftyone/events";
import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import {
  useReverbState,
  useReverbValue,
  useResetReverbState,
} from "@fiftyone/reverb";
import styled from "styled-components";
import QueryPerformanceIcon from "./QueryPerformanceIcon";
import { FilterInputDiv } from "./utils";

const Text = styled.div`
  font-size: 1rem;
  color: ${cssVar.color.text.secondary};
`;

const FLEX = { display: "flex" };

/** e2e specs wait on the sidebar showing a mode */
type SidebarModeE2EEvents = {
  "e2e:sidebar:mode-shown": { filter: boolean };
};

const ModeIcon = styled.span`
  display: flex;
  margin: auto 0.25rem;
  cursor: pointer;
  color: ${cssVar.color.text.tertiary};

  &:hover {
    color: ${cssVar.color.text.primary};
  }
`;

const ClearIcon = styled.span`
  display: flex;
  margin-right: 0.25rem;
  color: ${cssVar.color.text.secondary};

  &:hover {
    color: ${cssVar.color.text.primary};
  }
`;

/**
 * The sidebar's mode row: the Filter / Visibility toggle on the left,
 * the query-performance bolt on the right.
 */
const Filter = (_props: { modal?: boolean }) => {
  const [isFilterMode, setIsFilterMode] = useReverbState(
    fos.isSidebarFilterMode,
  );

  useEffect(() => {
    getEventBus<SidebarModeE2EEvents>().dispatch("e2e:sidebar:mode-shown", {
      filter: isFilterMode,
    });
  }, [isFilterMode]);

  const resetSelectedFieldStages = useResetReverbState(
    fos.fieldVisibilityStage,
  );

  const { resetExcludedPaths, affectedPathCount, isFieldVisibilityActive } =
    fos.useSchemaSettings();

  const queryPerformance = useReverbValue(fos.queryPerformance);

  return (
    <FilterInputDiv>
      <div style={{ display: "flex", alignItems: "center" }}>
        {isFilterMode && (
          <div style={FLEX} onClick={() => setIsFilterMode(false)}>
            <Tooltip content="Toggle to visibility mode" anchor="bottom">
              <ModeIcon>
                <FilterAltIcon size={14} />
              </ModeIcon>
            </Tooltip>
            <Tooltip
              content="Use the controls below to create filtered views into your data"
              anchor="bottom"
            >
              <Text data-cy="sidebar-mode-status">FILTER</Text>
            </Tooltip>
          </div>
        )}
        {!isFilterMode && (
          <div style={FLEX} onClick={() => setIsFilterMode(true)}>
            <Tooltip content="Toggle to filter mode" anchor="bottom">
              <ModeIcon>
                <VisibilityIcon size={14} />
              </ModeIcon>
            </Tooltip>
            <Tooltip
              content="Use the controls below to toggle the visibility of field values in the grid"
              anchor="bottom"
            >
              <Text data-cy="sidebar-mode-status">VISIBILITY</Text>
            </Tooltip>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {isFieldVisibilityActive && (
          <Tooltip content="Clear field selection" anchor="bottom">
            <div
              data-cy="field-visibility-btn-clear"
              style={{
                minWidth: "50px",
                maxWidth: "100px",
                background: cssVar.color.bg["card-elevated"],
                borderRadius: "25px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => {
                resetSelectedFieldStages();
                resetExcludedPaths();
              }}
            >
              {affectedPathCount > 0 && (
                <VoodoText
                  variant={TextVariant.Caption}
                  color={TextColor.Tertiary}
                  style={{ marginRight: "0.25rem" }}
                >
                  {affectedPathCount}
                </VoodoText>
              )}
              <ClearIcon>
                <VisibilityOffIcon size={14} />
              </ClearIcon>
            </div>
          </Tooltip>
        )}
        {queryPerformance && <QueryPerformanceIcon />}
      </div>
    </FilterInputDiv>
  );
};

export default React.memo(Filter);
