import * as fos from "@fiftyone/state";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import RangeSlider from "./RangeSlider";
import { Button } from "@mui/material";
import { LoadingDots, useTheme } from "@fiftyone/components";
import * as state from "./state";
import * as schemaAtoms from "@fiftyone/state/src/recoil/schema";

const Container = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`;

const Box = styled.div`
  display: flex;
  justify-content: space-between;
  column-gap: 1rem;
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  height: 30px;
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
  const theme = useTheme();
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

  const showButton = isGroup && queryPerformance && !showRange;

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
              onClick={handleShowRange}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "10px",
                color: theme.text.secondary,
                borderRadius: "8px",
                border: "1px solid " + theme.secondary.main,
              }}
            >
              Filter by {name}
            </Button>
          </Box>
        ) : (
          <RangeSlider color={color} modal={modal} path={path} />
        )}
      </Suspense>
    </Container>
  );
};

export default NumericFieldFilter;
