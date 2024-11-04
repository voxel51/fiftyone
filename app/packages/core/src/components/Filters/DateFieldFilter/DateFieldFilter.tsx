import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import * as state from "./state";
import Boxes from "./Boxes";

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

const DateFieldFilter = ({ color, modal, named = true, path }: Props) => {
  const name = path.split(".").slice(-1)[0];
  const field = fos.useAssertedRecoilValue(fos.field(path));
  const hasBounds = useRecoilValue(state.hasBounds({ path, modal }));
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  if (!queryPerformance && named && !hasBounds) {
    return null;
  }

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
      <Boxes path={path} modal={modal} />
    </Container>
  );
};

export default DateFieldFilter;
