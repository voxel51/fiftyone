import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import Boxes from "./Boxes";
import RangeSlider from "./RangeSlider";
import * as state from "./state";
import { Button, Typography } from "@mui/material";
import { useTheme } from "@fiftyone/components";

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
  const isGroup = path.includes(".");
  const theme = useTheme();
  const [showRange, setShowRange] = React.useState(!isGroup);
  const field = fos.useAssertedRecoilValue(fos.field(path));
  const queryPerformance = useRecoilValue(fos.queryPerformance);

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
    </Container>
  );
};

export default NumericFieldFilter;
