import * as fos from "@fiftyone/state";
import { formatPrimitive } from "@fiftyone/utilities";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import CommonRangeSlider from "../../Common/RangeSlider";
import Box from "./Box";
import FilterOption from "./FilterOption";
import Inputs from "./Inputs";
import Nonfinites from "./Nonfinites";
import Reset from "./Reset";
import * as state from "./state";

const Container = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary} !important;
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const useNoResults = (path: string) => {
  const indexed = useRecoilValue(fos.pathHasIndexes({ path }));
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const isOfList = useRecoilValue(fos.isOfDocumentFieldList(path));
  const isList = useRecoilValue(fos.isListField(path));

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
  const ftype = useRecoilValue(fos.fieldType({ path }));
  const key = path.replace(/[ ,.]/g, "-");
  const excluded = useRecoilValue(fos.numericExcludeAtom({ modal, path }));
  const defaultRange = useRecoilValue(state.hasDefaultRange({ modal, path }));
  const one = useRecoilValue(state.oneBound({ path, modal }));
  const timeZone = useRecoilValue(fos.timeZone);
  const hasBounds = useRecoilValue(state.hasBounds({ path, modal }));
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
          showBounds={false}
          fieldType={ftype}
          valueAtom={fos.rangeAtom({
            modal,
            path,
            withBounds: true,
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
