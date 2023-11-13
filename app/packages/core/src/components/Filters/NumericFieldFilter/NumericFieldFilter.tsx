import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import RangeSlider from "../../Common/RangeSlider";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import FilterOption from "./FilterOption";
import Nonfinites from "./Nonfinites";
import Reset from "./Reset";
import * as state from "./state";

const NamedRangeSliderContainer = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const NamedRangeSliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const RangeSliderContainer = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

type Props = {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
  named?: boolean;
  color: string;
  onFocus?: () => void;
  onBlur?: () => void;
};

const NumericFieldFilter = ({
  defaultRange,
  modal,
  path,
  named = true,
}: Props) => {
  const name = path.split(".").slice(-1)[0];
  const color = useRecoilValue(fos.pathColor(path));
  const ftype = useRecoilValue(fos.fieldType({ path }));
  const field = fos.useAssertedRecoilValue(fos.field(path));
  const hasBounds = useRecoilValue(state.hasBounds({ defaultRange, path }));
  const lightning = useRecoilValue(fos.isLightningPath(path));

  const key = path.replace(/[ ,.]/g, "-");

  if (!lightning && !hasBounds) {
    return null;
  }

  return (
    <NamedRangeSliderContainer onClick={(e) => e.stopPropagation()}>
      {named && name && (
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <NamedRangeSliderHeader>
              <span ref={hoverTarget}>{label}</span>
            </NamedRangeSliderHeader>
          )}
        />
      )}
      <RangeSliderContainer
        onMouseDown={(e) => e.stopPropagation()}
        style={{ cursor: "default" }}
        data-cy={`numeric-slider-container-${key}`}
      >
        {hasBounds && (
          <RangeSlider
            showBounds={false}
            fieldType={ftype}
            valueAtom={fos.rangeAtom({
              modal,
              path,
              defaultRange,
              withBounds: true,
            })}
            boundsAtom={fos.boundsAtom({
              path,
              defaultRange,
            })}
            color={color}
          />
        )}
        <Nonfinites modal={modal} path={path} />
        <FilterOption defaultRange={defaultRange} modal={modal} path={path} />
        <Reset defaultRange={defaultRange} modal={modal} path={path} />
      </RangeSliderContainer>
    </NamedRangeSliderContainer>
  );
};

export default NumericFieldFilter;
