import { Selector } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";
import React from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { gridSortBy, gridSortByState, sortFields } from "../recoil";
import { RightDiv, SliderContainer } from "./Containers";

const Field = ({ value }: { className?: string; value: string }) => {
  return <>{value}</>;
};

export default function Sort() {
  const indexes = useRecoilValue(sortFields);
  const value = useRecoilValue(gridSortBy);
  const select = useSetRecoilState(gridSortByState);
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  if (!indexes.length || !queryPerformance) {
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
            v && select((current) => ({ ...current, field: v }));
          }}
          useSearch={(v) => {
            const values = indexes.filter((field) => field.startsWith(v));
            return { values };
          }}
          overflow={true}
          placeholder="Sort by"
        />
      </RightDiv>
      <div
        title={value?.descending ? "Descending" : "Ascending"}
        onClick={() =>
          select((current) => ({ ...current, descending: !current.descending }))
        }
        style={{ cursor: "pointer", display: "flex" }}
      >
        {value?.descending ? <ArrowDownward /> : <ArrowUpward />}
      </div>
    </SliderContainer>
  );
}
