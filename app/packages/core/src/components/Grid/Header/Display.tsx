import { ToolbarAction } from "@fiftyone/actions";
import * as fos from "@fiftyone/state";
import { ACTIVE_FIELD, activeColorEntry } from "@fiftyone/state";
import {
  useReverbState,
  useReverbValue,
  useResetReverbState,
  useSetReverbState,
} from "@fiftyone/reverb";
import {
  Input,
  InputType,
  PaletteIcon,
  Popover,
  PopoverAnchor,
  Select,
  SettingsIcon,
  SingleValueSlider,
  Toggle,
  ZoomInIcon,
  ZoomOutIcon,
} from "@voxel51/voodo";
import styled from "styled-components";
import { gridSpacing, gridZoom } from "../atoms";
import { ZOOM_RANGE } from "../useZoomSetting";

const Panel = styled.div`
  width: 288px;
  padding: 6px;
  box-sizing: border-box;
`;

const Label = styled.div`
  padding: 6px 8px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--color-content-text-primary);
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 15px;
  line-height: 24px;
  color: var(--color-content-text-secondary);
`;

const Item = styled(Row).attrs({ as: "button", type: "button" })`
  justify-content: flex-start;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--color-content-bg-card);
    color: var(--color-content-text-primary);
  }
`;

const Separator = styled.div`
  height: 1px;
  margin: 4px -4px;
  background: var(--color-content-bg-muted);
`;

const Icon = styled.span`
  display: flex;
  flex-shrink: 0;
  color: var(--color-content-icon-default);
`;

// A NaN left in browser storage by an earlier session would round-trip
// through the slider forever, so non-finite values fall back to the default
const safeNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const Slider = ({
  max,
  min,
  onChange,
  step,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) => (
  <SingleValueSlider
    bare
    debounceDelay={0}
    min={min}
    max={max}
    step={step}
    value={value}
    style={{ flex: 1, minWidth: 0 }}
    onChange={(next) => Number.isFinite(next) && onChange(next)}
  />
);

const Zoom = () => {
  const [value, setValue] = useReverbState(gridZoom);

  return (
    <Row>
      <Icon>
        <ZoomOutIcon size={14} />
      </Icon>
      <Slider
        min={ZOOM_RANGE[0]}
        max={ZOOM_RANGE[1]}
        step={0.01}
        value={safeNumber(value, ZOOM_RANGE[0])}
        onChange={setValue}
      />
      <Icon>
        <ZoomInIcon size={14} />
      </Icon>
    </Row>
  );
};

const Spacing = () => {
  const [value, setValue] = useReverbState(gridSpacing);
  const reset = useResetReverbState(gridSpacing);

  return (
    <Row onDoubleClick={reset} title="Double-click to reset">
      Spacing
      <Slider
        min={0}
        max={64}
        step={1}
        value={safeNumber(value, 3)}
        onChange={setValue}
      />
    </Row>
  );
};

const MediaField = () => {
  const fields = useReverbValue(fos.mediaFields);
  const [field, setField] = useReverbState(fos.selectedMediaField(false));
  if (!fields || fields.length <= 1) return null;

  return (
    <Row>
      Media
      <Select
        exclusive
        portal
        value={field}
        options={fields.map((f) => ({ id: f, data: { label: f } }))}
        onChange={(v) => typeof v === "string" && setField(v)}
      />
    </Row>
  );
};

const Memory = () => {
  const [autosizing, setAutosizing] = useReverbState(fos.gridAutosizing);
  const [bytes, setBytes] = useReverbState(fos.maxGridItemsSizeBytes);

  return (
    <>
      <Row>
        Auto-size cache
        <Toggle
          checked={autosizing}
          onChange={setAutosizing}
          aria-label="Auto-size cache"
        />
      </Row>
      {autosizing && (
        <Row>
          Cache size (MB)
          <Input
            type={InputType.Number}
            min={1}
            value={Math.round(bytes / 1e6)}
            onChange={(e) => {
              const mb = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(mb) && mb > 0) setBytes(mb * 1e6);
            }}
            style={{ width: "5.5rem", textAlign: "right" }}
            aria-label="Cache size in MB"
          />
        </Row>
      )}
    </>
  );
};

const ColorSettings = ({ close }: { close: () => void }) => {
  const setActiveColorEntry = useSetReverbState(activeColorEntry);

  return (
    <Item
      data-cy="action-color-settings"
      onClick={() => {
        close();
        setActiveColorEntry(ACTIVE_FIELD.GLOBAL);
      }}
    >
      <Icon>
        <PaletteIcon size={14} />
      </Icon>
      Color settings
    </Item>
  );
};

/** The grid's display settings, behind the toolbar's gear */
const Display = () => (
  <Popover
    portal
    anchor={PopoverAnchor.BottomEnd}
    trigger={
      <ToolbarAction
        aria-label="Display settings"
        title="Display settings"
        data-cy="action-display-options"
        icon={SettingsIcon}
      />
    }
  >
    {({ close }) => (
      <Panel>
        <Label>Display</Label>
        <Zoom />
        <Spacing />
        <MediaField />
        <Separator />
        <Label>Performance</Label>
        <Memory />
        <Separator />
        <ColorSettings close={close} />
      </Panel>
    )}
  </Popover>
);

export default Display;
