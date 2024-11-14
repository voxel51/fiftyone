import * as fos from "@fiftyone/state";
import { formatPrimitive } from "@fiftyone/utilities";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import CommonRangeSlider from "../../Common/RangeSlider";
import Box from "./Box";
import FilterOption from "./FilterOption";
import Nonfinites from "./Nonfinites";
import Reset from "./Reset";
import * as state from "./state";

const Container = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const RangeSlider = ({
  color,
  modal,
  path,
}: {
  color: string;
  modal: boolean;
  path: string;
}) => {
  const ftype = useRecoilValue(fos.fieldType({ path }));
  const key = path.replace(/[ ,.]/g, "-");
  const excluded = useRecoilValue(fos.numericExcludeAtom({ modal, path }));
  const defaultRange = useRecoilValue(state.hasDefaultRange({ modal, path }));
  const one = useRecoilValue(state.oneBound({ path, modal }));
  const timeZone = useRecoilValue(fos.timeZone);
  const hasBounds = useRecoilValue(state.hasBounds({ path, modal }));

  if (!hasBounds) {
    return <Box text="No results" />;
  }

  const showSlider = hasBounds && !(excluded && defaultRange);
  if (showSlider && one !== null) {
    return (
      <Box
        text={formatPrimitive({ ftype, timeZone, value: one })?.toString()}
      />
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
      {defaultRange && <Nonfinites modal={modal} path={path} />}
      <FilterOption color={color} modal={modal} path={path} />
      <Reset color={color} modal={modal} path={path} />
    </Container>
  );
};

export default RangeSlider;
