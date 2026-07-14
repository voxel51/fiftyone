import { Selector } from "@fiftyone/components";
import {
  gridSortBy,
  gridSortFields,
  queryPerformance,
  similarityParameters,
} from "@fiftyone/state";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";
import { useRecoilState, useRecoilValue } from "recoil";
import { ActionOption } from "../../Actions/Common";
import { SORT_BY_INDEXED_FIELDS } from "../../../utils/links";
import { RightDiv, SliderContainer } from "./Containers";

const Field = ({ value }: { className?: string; value: string }) => {
  return <>{value}</>;
};

export default function Sort() {
  const fields = useRecoilValue(gridSortFields);
  const [value, select] = useRecoilState(gridSortBy);
  const similarity = useRecoilValue(similarityParameters);
  const isQPEnabled = useRecoilValue(queryPerformance);
  if (!fields.length || similarity) {
    return null;
  }

  const footer = isQPEnabled ? (
    <ActionOption
      text="Add additional fields"
      href={SORT_BY_INDEXED_FIELDS}
      title="More on sorting with Query Performance"
      style={{ background: "unset", paddingTop: 0, paddingBottom: 0 }}
      svgStyles={{ height: "1rem" }}
    />
  ) : undefined;

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
          footer={footer}
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
