import {
  Anchor,
  Icon,
  IconName,
  Popover,
  PopoverAnchor,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import styled from "styled-components";
import { PRESS_CLASS, TOOLTIP_CLASS } from "./classes";
import { Word } from "./Sentence";
import DisplayOptions from "./DisplayOptions";
import { Spacing, Zoom } from "./Sliders";

const Panel = styled.div`
  display: grid;
  grid-template-columns: auto 12rem;
  align-items: center;
  gap: 0.75rem 1rem;
  padding: 0.75rem 1rem;
`;

const Settings = () => (
  <Popover
    anchor={PopoverAnchor.BottomEnd}
    trigger={
      <Tooltip
        content="Display"
        anchor={Anchor.Left}
        className={TOOLTIP_CLASS}
        portal
      >
        <div className={PRESS_CLASS}>
          <Icon name={IconName.Sliders} size={Size.Xl} />
        </div>
      </Tooltip>
    }
  >
    <Panel>
      <Word>Spacing</Word>
      <Spacing />
      <Word>Zoom</Word>
      <Zoom />
      <DisplayOptions />
    </Panel>
  </Popover>
);

export default Settings;
