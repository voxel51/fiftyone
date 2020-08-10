import React, { useState, useRef } from "react";
import styled from "styled-components";

import { Button } from "./utils";

type Props = {
  object: object;
};

const Body = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  pre {
    margin: 0;
    padding: 2em;
    flex-grow: 1;
    overflow-y: auto;
  }

  footer {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    align-items: flex-end;
    border-top: 2px solid ${({ theme }) => theme.border};
    padding: 1em;
    background-color: ${({ theme }) => theme.backgroundLight};
  }
`;

const JSONView = ({ object }: Props) => {
  return (
    <Body>
      <pre>{JSON.stringify(object, null, 4)}</pre>
      <footer>
        <Button>Copy JSON</Button>
      </footer>
    </Body>
  );
};

export default JSONView;
