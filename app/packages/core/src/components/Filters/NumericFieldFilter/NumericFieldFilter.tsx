import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import Boxes from "./Boxes";
import RangeSlider from "./RangeSlider";
import * as state from "./state";

const Container = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`;

type Props = {
  color: string;
  modal: boolean;
  named?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  path: string;
};

const NumericFieldFilter = ({ color, modal, named = true, path }: Props) => {
  const name = path.split(".").slice(-1)[0];
  const field = fos.useAssertedRecoilValue(fos.field(path));
  const hasBounds = useRecoilValue(state.hasBounds({ path, modal }));
  const indexed = useRecoilValue(fos.pathHasIndexes(path));
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  if (!queryPerformance && named && !hasBounds) {
    return null;
  }

  const boxes = queryPerformance && !indexed;

  return (
    <Container onClick={(e) => e.stopPropagation()}>
      {named && name && (
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <Header>
              <span ref={hoverTarget}>{label}</span>
            </Header>
          )}
        />
      )}
      {boxes ? (
        <Boxes path={path} />
      ) : (
        <RangeSlider color={color} modal={modal} path={path} />
      )}
    </Container>
  );
};

export default NumericFieldFilter;
