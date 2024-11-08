import { LoadingDots } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import * as schemaAtoms from "@fiftyone/state/src/recoil/schema";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { Button } from "../../utils";
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

const Box = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
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
  const fieldType = useRecoilValue(schemaAtoms.filterFields(path));
  const isGroup = fieldType.length > 1;
  const [showRange, setShowRange] = React.useState(!isGroup);
  const field = fos.useAssertedRecoilValue(fos.field(path));
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const hasBounds = useRecoilValue(
    state.hasBounds({ path, modal, shouldCalculate: !queryPerformance })
  );

  if (!queryPerformance && named && !hasBounds) {
    return null;
  }

  const handleShowRange = () => {
    setShowRange(true);
  };

  const showButton = isGroup && queryPerformance && !showRange && !modal;

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
      <Suspense
        fallback={
          <Box>
            <LoadingDots text="Loading" />
          </Box>
        }
      >
        {showButton ? (
          <Box>
            <Button
              text={`Filter by ${name}`}
              color={color}
              onClick={handleShowRange}
              style={{
                margin: "0.25rem -0.5rem",
                height: "2rem",
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
