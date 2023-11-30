import { ExternalLink, Tooltip } from "@fiftyone/components";
import useLightningUnlocked from "@fiftyone/state/src/hooks/useLightningUnlocked";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
import Launch from "@mui/icons-material/Launch";
import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import { useTheme } from "styled-components";
import { INDEXES_PLUGIN } from "../../../../utils/links";

export default ({
  color,
  expanded,
  id,
  unindexed,
}: {
  color?: string;
  unindexed?: boolean;
  expanded: RecoilState<boolean>;
  id: string;
}) => {
  const [isExpanded, setExpanded] = useRecoilState(expanded);
  const Arrow = isExpanded ? KeyboardArrowUp : KeyboardArrowDown;
  const theme = useTheme();
  const unlocked = useLightningUnlocked();

  if (unindexed && !unlocked) {
    return (
      <Tooltip
        text={
          <ExternalLink
            style={{ color: theme.text.primary, padding: "0.25rem" }}
            href={INDEXES_PLUGIN}
          >
            add an index <Launch style={{ height: "1rem", marginTop: 7.5 }} />
          </ExternalLink>
        }
        placement="top-center"
      >
        <Arrow
          data-cy={`sidebar-field-arrow-${id}`}
          style={{ margin: 0, color: theme.text.secondary }}
        />
      </Tooltip>
    );
  }

  return (
    <Arrow
      data-cy={`sidebar-field-arrow-${id}`}
      style={{
        cursor: "pointer",
        margin: 0,
        color: color ?? theme.text.primary,
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded((v) => !v);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onMouseUp={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    />
  );
};
