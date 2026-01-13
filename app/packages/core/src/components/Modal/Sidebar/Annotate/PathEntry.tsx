import * as fos from "@fiftyone/state";
import {
  formatPrimitive,
  makePseudoField,
  type Primitive,
} from "@fiftyone/utilities";
import { animated } from "@react-spring/web";
import { useSetAtom } from "jotai";
import { get } from "lodash";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { editing } from "./Edit";
import { PRIMITIVE } from "./Edit/state";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: 2px;
  background: ${({ theme }) => theme.neutral.softBg};
  padding: 0.5rem;

  &:hover,
  &.hovering {
    background: ${({ theme }) => theme.background.level1};
  }
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;
  width: 100%;
  flex: 1;
  justify-content: space-between;
  gap: 0.5rem;
`;

const FormattedValue = styled.div`
  color: ${({ theme }) => theme.text.secondary};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
  text-align: right;
`;

interface PathEntryProps {
  path: string;
}

interface UrlLinkProps {
  url: URL;
}

const UrlLink = ({ url }: UrlLinkProps) => {
  return (
    <a href={url.toString()} target="_blank" rel="noreferrer">
      {url.toString()}
    </a>
  );
};

const PathEntry = ({ path }: PathEntryProps) => {
  const field = useRecoilValue(fos.field(path)) ?? makePseudoField(path);
  const currentSample = useRecoilValue(fos.activeModalSidebarSample);
  const timeZone = useRecoilValue(fos.timeZone);
  const setEditing = useSetAtom(editing);

  // Get the value from the current sample using the path
  const value = currentSample ? get(currentSample, path) : null;
  console.log("field", field);
  console.log("path", path);
  console.log("value", value);

  const formatted = useMemo(() => {
    if (!value) return null;

    const result = formatPrimitive({
      ftype: field.ftype || "",
      timeZone,
      value: value as Primitive,
    });

    if (result instanceof URL) {
      return <UrlLink url={result} />;
    }
    return result;
  }, [field.ftype, timeZone, value]);

  return (
    <Container onClick={() => setEditing(PRIMITIVE)}>
      <Header>
        <div>{field.name || path}</div>
        <FormattedValue>{formatted}</FormattedValue>
      </Header>
    </Container>
  );
};

export default PathEntry;
