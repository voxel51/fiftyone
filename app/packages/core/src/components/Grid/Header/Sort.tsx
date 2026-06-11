import {
  gridSortBy,
  gridSortFields,
  similarityParameters,
} from "@fiftyone/state";
import { Icon, IconName, Select, Size, Tooltip } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { RightDiv, SliderContainer } from "./Containers";

// Sentinel option used to clear the sort selection. voodo Select needs
// every choice to be an option entry, so "no sort" gets an explicit row.
const CLEAR_ID = "__sort_clear__";

// Same hover/press class used by the Spacing / Zoom reset affordances.
const PRESS_CLASS =
  "cursor-pointer flex items-center justify-center p-1.5 hover:scale-[1.1] active:scale-[0.92] transition-transform duration-[150ms] ease-out";

// Match the header's tooltip surface: translucent so grid samples stay
// partly visible behind the label.
const TOOLTIP_CLASS =
  "!bg-black/70 !text-white backdrop-blur-sm whitespace-nowrap";

export default function Sort() {
  const fields = useRecoilValue(gridSortFields);
  const [value, select] = useRecoilState(gridSortBy);
  const similarity = useRecoilValue(similarityParameters);

  const options = useMemo(
    () => [
      { id: CLEAR_ID, data: { label: "Clear sort" } },
      ...fields.map((f) => ({ id: f, data: { label: f } })),
    ],
    [fields]
  );

  if (!fields.length || similarity) {
    return null;
  }

  return (
    <SliderContainer style={{ width: "auto" }}>
      {/* Constrain the Sort selector to a fixed width so it doesn't
          eat into the spacing/zoom slider area. `flexShrink: 0` keeps
          it from collapsing under flex pressure. */}
      <RightDiv style={{ paddingRight: 0, width: 140, flexShrink: 0 }}>
        <Select
          exclusive
          portal
          value={value?.field ?? undefined}
          options={options}
          onChange={(v) => {
            if (typeof v !== "string") return;
            if (v === CLEAR_ID) {
              select(null);
              return;
            }
            select((current) => ({
              field: v,
              descending: Boolean(current?.descending),
            }));
          }}
          style={{ width: "100%" }}
        />
      </RightDiv>
      {value !== null && (
        <Tooltip
          content={value?.descending ? "Descending" : "Ascending"}
          className={TOOLTIP_CLASS}
          portal
        >
          <div
            onClick={() =>
              select((current) => ({
                ...current,
                descending: !current.descending,
              }))
            }
            className={PRESS_CLASS}
          >
            <Icon
              name={value?.descending ? IconName.ArrowDown : IconName.ArrowUp}
              size={Size.Xl}
            />
          </div>
        </Tooltip>
      )}
    </SliderContainer>
  );
}
