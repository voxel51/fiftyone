import * as fos from "@fiftyone/state";
import {
  formatPrimitive,
  makePseudoField,
  type Primitive,
} from "@fiftyone/utilities";
import { animated } from "@react-spring/web";
import { Anchor, Text, Tooltip } from "@voxel51/voodo";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import useActivePrimitive from "./Edit/useActivePrimitive";
import { useReadOnly } from "./SchemaManager/EditFieldLabelSchema/useLabelSchema";
import { useSampleSelector } from "@fiftyone/annotation";
import {
  useFramePrimitiveReadOnlyReason,
  useFramePrimitiveValue,
  useIsFramePrimitive,
} from "./useFramePrimitive";

const Container = animated(styled.div<{ $isReadOnly?: boolean }>`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: var(--radius-xs);
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
  const isFramePrimitive = useIsFramePrimitive(path);
  const sampleValue = useSampleSelector((s) => s.getResolved<Primitive>(path));
  const frameValue = useFramePrimitiveValue(path);
  const value = isFramePrimitive ? frameValue : sampleValue;
  const timeZone = useRecoilValue(fos.timeZone);
  const [, setActivePrimitive] = useActivePrimitive();
  const { isReadOnly: schemaReadOnly } = useReadOnly(path);
  const readOnlyReason = useFramePrimitiveReadOnlyReason(path);
  const isReadOnly = schemaReadOnly || readOnlyReason !== null;

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
    setActivePrimitive(path);
  };

  const entry = (
    <Container
      $isReadOnly={isReadOnly}
      data-cy={`annotate-primitive-${path}`}
      data-cy-read-only={isReadOnly ? "true" : "false"}
      onClick={!isReadOnly ? handleClick : undefined}
      style={{ cursor: isReadOnly ? "default" : "pointer" }}
    >
      <Header>
        <div>{path}</div>
        <FormattedValue data-cy="annotate-primitive-value">
          {formatted}
        </FormattedValue>
      </Header>
    </Container>
  );

  if (readOnlyReason === null) {
    return entry;
  }

  return (
    <Tooltip anchor={Anchor.Top} content={<Text>{readOnlyReason}</Text>} portal>
      {entry}
    </Tooltip>
  );
};

export default PrimitiveEntry;
