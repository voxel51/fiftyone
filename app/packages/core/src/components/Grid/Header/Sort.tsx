import {
  gridSortBy,
  gridSortFields,
  similarityParameters,
} from "@fiftyone/state";
import { Icon, IconName, Select, Size } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { RightDiv, SliderContainer } from "./Containers";

// Sentinel option used to clear the sort selection — voodo Select
// requires every choice to have an option entry, so "no sort" needs an
// explicit row.
const CLEAR_ID = "__sort_clear__";

// Same hover/press class used by the Spacing / Zoom reset affordances.
const PRESS_CLASS =
  "cursor-pointer flex items-center justify-center p-1.5 hover:scale-[1.1] active:scale-[0.92] transition-transform duration-[150ms] ease-out";

export default function Sort() {
  const fields = useRecoilValue(gridSortFields);
  const [value, select] = useRecoilState(gridSortBy);
  const similarity = useRecoilValue(similarityParameters);
  if (!fields.length || similarity) {
    return null;
  }

  const options = useMemo(
    () => [
      { id: CLEAR_ID, data: { label: "Clear sort" } },
      ...fields.map((f) => ({ id: f, data: { label: f } })),
    ],
    [fields]
  );

  return (
    <SliderContainer style={{ width: "auto" }}>
      <RightDiv style={{ paddingRight: 0, border: "unset" }}>
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
          style={{ margin: "0 0.5rem", minWidth: 160 }}
        />
      </RightDiv>
      {value !== null && (
        <div
          title={value?.descending ? "Descending" : "Ascending"}
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
      )}
    </SliderContainer>
  );
}
