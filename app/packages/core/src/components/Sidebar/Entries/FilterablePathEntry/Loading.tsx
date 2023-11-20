import { LoadingDots } from "@fiftyone/components";
import React, { useEffect, useState } from "react";
import styled from "styled-components";

const Loading = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  position: relative;
`;

export default function () {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setShow(true), 300);

    return () => {
      clearTimeout(timeout);
      setShow(false);
    };
  }, []);

  if (!show) {
    return null;
  }
  return (
    <Loading>
      <LoadingDots text="Loading" />
    </Loading>
  );
}
