import * as fos from "@fiftyone/state";
import React, { Suspense } from "react";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { Button } from "../../utils";
import useQueryPerformanceIcon from "../use-query-performance-icon";
import useQueryPerformanceTimeout from "../use-query-performance-timeout";
import Box from "./Box";
import RangeSlider from "./RangeSlider";
import useShow from "./use-show";

const Container = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  const [showRange, setShowRange] = React.useState(!named);
  const field = fos.useAssertedRecoilValue(fos.field(path));

  const { show, showLoadButton } = useShow(modal, named, path, showRange);
  const icon = useQueryPerformanceIcon(modal, named, path, color);
  if (!show) {
    return null;
  }

  const handleShowRange = () => {
    setShowRange(true);
  };

  return (
    <Container
      data-cy={`numeric-filter-${path}`}
      onClick={(e) => e.stopPropagation()}
    >
      {named && name && (
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <Header>
              <span ref={hoverTarget}>{label}</span>
              {icon}
            </Header>
          )}
        />
      )}
      <Suspense fallback={<Loading modal={modal} path={path} />}>
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

const Loading = ({ modal, path }: { modal: boolean; path: string }) => {
  useQueryPerformanceTimeout(modal, path);
  return <Box text="Loading" />;
};

export default NumericFieldFilter;
