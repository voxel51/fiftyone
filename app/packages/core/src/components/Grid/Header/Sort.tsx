import { Selector } from "@fiftyone/components";
import { gridSortBy, gridSortFields } from "@fiftyone/state";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { RightDiv, SliderContainer } from "./Containers";

const Field = ({ value }: { className?: string; value: string }) => {
  return <>{value}</>;
};

export default function Sort() {
  const fields = useRecoilValue(gridSortFields);
  const [value, select] = useRecoilState(gridSortBy);
  if (!fields.length) {
    return null;
  }

  return (
    <SliderContainer style={{ width: "auto" }}>
      <RightDiv style={{ paddingRight: 0, border: "unset" }}>
        <Selector
          inputStyle={{ height: 28 }}
          component={Field}
          containerStyle={{
            margin: "0 0.5rem",
            position: "relative",
          }}
          value={value?.field}
          onSelect={(_, v) => {
            if (!v) {
              return;
            }
            if (v === "-") {
              select(null);
              return;
            }

            select((current) => ({
              field: v,
              descending: Boolean(current?.descending),
            }));
          }}
          useSearch={(v) => {
            const values = fields.filter((field) => field.startsWith(v));
            return { values: ["-", ...values] };
          }}
          overflow={true}
          placeholder="Sort by"
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
          style={{ cursor: "pointer", display: "flex" }}
        >
          {value?.descending ? <ArrowDownward /> : <ArrowUpward />}
        </div>
      )}
    </SliderContainer>
  );
}
