import { Selector } from "@fiftyone/components";
import { ArrowDownward } from "@mui/icons-material";
import React from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { sortBy, sortByState, sortFields } from "../recoil";
import { RightDiv, SliderContainer } from "./Containers";

const Field = ({ value }: { className?: string; value: string }) => {
  return <>{value}</>;
};

export default function Sort() {
  const indexes = useRecoilValue(sortFields);
  const value = useRecoilValue(sortBy);
  const select = useSetRecoilState(sortByState);
  return (
    <SliderContainer style={{ width: "auto" }}>
      <RightDiv style={{ paddingRight: 0 }}>
        <Selector
          inputStyle={{ height: 28 }}
          component={Field}
          containerStyle={{
            margin: "0 0.5rem",
            position: "relative",
          }}
          value={value}
          onSelect={(_, v) => {
            v && select(v);
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
        title={"Descending"}
        onClick={() => null}
        onKeyDown={() => null}
        style={{ cursor: "pointer", display: "flex" }}
      >
        <ArrowDownward />
      </div>
    </SliderContainer>
  );
}
