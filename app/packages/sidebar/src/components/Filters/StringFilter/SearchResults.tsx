import {
  cssVar,
  LoadingDots,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useEffect } from "react";
import styled from "styled-components";
import type { Result } from "./Result";

const ROW_HEIGHT = 28;
const MAX_ROWS = 6;

const List = styled.div`
  max-height: ${ROW_HEIGHT * MAX_ROWS}px;
  overflow-y: auto;
  font-weight: normal;
`;

const Row = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: ${ROW_HEIGHT}px;
  padding: 0 0.375rem;
  border-radius: 4px;
  cursor: pointer;
  background: ${({ $active }) =>
    $active ? cssVar.color.bg["card-elevated"] : "transparent"};

  &:hover {
    background: ${cssVar.color.bg["card-elevated"]};
  }
`;

// rtl truncation drops the start, so a path keeps its filename end
const START_TRUNCATED = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  direction: "rtl",
  textAlign: "left",
} as const;

export const optionId = (listId: string, index: number) => `${listId}-${index}`;

/** A string filter's search results, listed in place under its input. */
export default function SearchResults({
  active,
  id,
  loading,
  onPick,
  results,
}: {
  active: number | null;
  id: string;
  loading: boolean;
  onPick: (result: Result) => void;
  results: Result[];
}) {
  useEffect(() => {
    if (active === null) return;
    document
      .getElementById(optionId(id, active))
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, id]);

  if (loading) {
    return <LoadingDots text="Loading" />;
  }

  if (!results.length) {
    return <Text variant={TextVariant.BodyTertiary}>No results</Text>;
  }

  return (
    <List id={id} role="listbox">
      {results.map((result, i) => {
        const text = result.value ?? "None";
        return (
          <Row
            key={result.value ?? "\u0000none"}
            id={optionId(id, i)}
            role="option"
            aria-selected={i === active}
            $active={i === active}
            title={text}
            // keep focus in the input for the next search
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(result)}
          >
            <Text
              variant={TextVariant.BodyTertiary}
              color={
                result.value === null ? TextColor.Tertiary : TextColor.Primary
              }
              style={START_TRUNCATED}
            >
              {`‎${text}‎`}
            </Text>
            {typeof result.count === "number" && (
              <Text variant={TextVariant.BodyTertiary} color={TextColor.Muted}>
                {result.count.toLocaleString()}
              </Text>
            )}
          </Row>
        );
      })}
    </List>
  );
}
