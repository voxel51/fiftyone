import * as fos from "@fiftyone/state";
import {
  formatPrimitive,
  makePseudoField,
  PRIMITIVE,
  type Primitive,
} from "@fiftyone/utilities";
import { animated } from "@react-spring/web";
import { useSetAtom } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { editing, primitivePath } from "./Edit/state";
import { useReadOnly } from "./SchemaManager/EditFieldLabelSchema/useLabelSchema";
import { useSampleValue } from "./useSampleValue";

const Container = animated(styled.div<{ $isReadOnly?: boolean }>`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: 2px;
  background: ${({ theme }) => theme.neutral.softBg};
  padding: 0.5rem;

  ${({ $isReadOnly, theme }) =>
    !$isReadOnly &&
    `
    &:hover,
    &.hovering {
      background: ${theme.background.level1};
    }`}
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

interface PrimitiveEntryProps {
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

const PrimitiveEntry = ({ path }: PrimitiveEntryProps) => {
  const field = useRecoilValue(fos.field(path)) ?? makePseudoField(path);
  const value = useSampleValue(path);
  const timeZone = useRecoilValue(fos.timeZone);
  const setPrimitivePath = useSetAtom(primitivePath);
  const { isReadOnly } = useReadOnly(path);
  const setEditingAtom = useSetAtom(editing);

  const formatted = useMemo(() => {
    if (value === undefined || value === null) return null;

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

  const handleClick = () => {
    if (isReadOnly) return;
    setEditingAtom(PRIMITIVE);
    setPrimitivePath(path);
  };

  return (
    <Container
      $isReadOnly={isReadOnly}
      onClick={!isReadOnly ? handleClick : undefined}
      style={{ cursor: isReadOnly ? "default" : "pointer" }}
    >
      <Header>
        <div>{field.name || path}</div>
        <FormattedValue>{formatted}</FormattedValue>
      </Header>
    </Container>
  );
};

export default PrimitiveEntry;
