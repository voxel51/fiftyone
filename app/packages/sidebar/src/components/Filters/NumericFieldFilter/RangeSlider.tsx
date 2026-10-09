import * as fos from "@fiftyone/state";
import { formatPrimitive } from "@fiftyone/utilities";
import { cssVar } from "@voxel51/voodo";
import { useReverbValue } from "@fiftyone/reverb";
import styled from "styled-components";
import CommonRangeSlider from "../../Common/RangeSlider";
import Box from "./Box";
import FilterOption from "./FilterOption";
import Inputs from "./Inputs";
import Nonfinites from "./Nonfinites";
import Reset from "./Reset";
import * as state from "./state";

const Container = styled.div`
  background: ${cssVar.color.bg.background};
  border: 1px solid ${cssVar.color.border.default};
  border-radius: 2px;
  color: ${cssVar.color.text.secondary} !important;
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const useNoResults = (path: string) => {
  const indexed = useReverbValue(fos.pathHasIndexes({ path }));
  const queryPerformance = useReverbValue(fos.queryPerformance);
  const isOfList = useReverbValue(fos.isOfDocumentFieldList(path));
  const isList = useReverbValue(fos.isListField(path));

  return indexed && queryPerformance && !isOfList && !isList;
};

const RangeSlider = ({
  color,
  modal,
  path,
}: {
  color: string;
  modal: boolean;
  path: string;
  inputs?: boolean;
}) => {
  const ftype = useReverbValue(fos.fieldType({ path }));
  const key = path.replace(/[ ,.]/g, "-");
  const excluded = useReverbValue(fos.numericExcludeAtom({ modal, path }));
  const defaultRange = useReverbValue(state.hasDefaultRange({ modal, path }));
  const one = useReverbValue(state.oneBound({ path, modal }));
  const timeZone = useReverbValue(fos.timeZone);
  const hasBounds = useReverbValue(state.hasBounds({ path, modal }));
  const showSlider = hasBounds && !(excluded && defaultRange);

  const noResults = useNoResults(path);
  if (!hasBounds && noResults) {
    return (
      <Box>
        <div>No results</div>
      </Box>
    );
  }

  if (showSlider && one !== null) {
    return (
      <Box>
        <div>
          {formatPrimitive({ ftype, timeZone, value: one })?.toString()}
        </div>
      </Box>
    );
  }

  return (
    <Container
      onMouseDown={(e) => e.stopPropagation()}
      style={{ cursor: "default" }}
      data-cy={`numeric-slider-container-${key}`}
    >
      {showSlider && (
        <CommonRangeSlider
          fieldType={ftype}
          valueAtom={fos.rangeAtom({
            modal,
            path,
            withBounds: false,
          })}
          boundsAtom={fos.boundsAtom({
            path,
            modal,
          })}
          color={color}
        />
      )}
      <Inputs modal={modal} path={path} color={color} />
      {defaultRange && <Nonfinites modal={modal} path={path} />}
      <FilterOption color={color} modal={modal} path={path} />
      <Reset color={color} modal={modal} path={path} />
    </Container>
  );
};

export default RangeSlider;
