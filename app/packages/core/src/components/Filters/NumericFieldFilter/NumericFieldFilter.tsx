import * as fos from "@fiftyone/state";
import * as schemaAtoms from "@fiftyone/state/src/recoil/schema";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { Button } from "../../utils";
import Box from "./Box";
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

const useShow = (
  isGroup: boolean,
  modal: boolean,
  named: boolean,
  path: string,
  showRange: boolean
) => {
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  const hasBounds = useRecoilValue(
    state.hasBounds({ path, modal, shouldCalculate: !queryPerformance })
  );

  return {
    show: !(!queryPerformance && named && !hasBounds),
    showLoadButton: isGroup && queryPerformance && !showRange && !modal,
  };
};

const NumericFieldFilter = ({ color, modal, named = true, path }: Props) => {
  const name = path.split(".").slice(-1)[0];
  const fieldType = useRecoilValue(schemaAtoms.filterFields(path));
  const isGroup = fieldType.length > 1;
  const [showRange, setShowRange] = React.useState(!isGroup);
  const field = fos.useAssertedRecoilValue(fos.field(path));

  const { show, showLoadButton } = useShow(
    isGroup,
    modal,
    named,
    path,
    showRange
  );

  if (!show) {
    return null;
  }

  const handleShowRange = () => {
    setShowRange(true);
  };

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
      <Suspense fallback={<Box text="Loading" />}>
        {showLoadButton ? (
          <Box>
            <Button
              text={`Filter by ${name}`}
              color={color}
              onClick={handleShowRange}
              style={{
                height: "2rem",
                margin: "0 -0.5rem",
                borderRadius: 0,
                textAlign: "center",
              }}
            />
          </Box>
        ) : (
          <RangeSlider color={color} modal={modal} path={path} />
        )}
      </Suspense>
    </Container>
  );
};

export default NumericFieldFilter;
