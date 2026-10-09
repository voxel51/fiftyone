import { cssVar } from "@voxel51/voodo";
import type { CSSProperties } from "react";
import styled from "styled-components";
import styles from "./underline.module.css";

/**
 * Sidebar row and expanded filter spacing. Each gap is set once: a filter's
 * controls start at the row's checkbox column and add no inset of their own.
 */
export const FILTER_SPACING = {
  // a row's content from its left edge: the 5px drag bar and 11px
  entryLeft: "16px",
  // the row's own right and bottom padding
  entryRight: "3px",
  entryBottom: "3px",
  // the row's header to the first control, and a filter's header to its body
  top: "4px",
  // between controls, and between stacked filters
  gap: "8px",
  // the last control to the row's end, the row's padding included
  bottom: "8px",
  // the controls' right edge from the row's
  right: "12px",
};

const { entryRight, entryBottom, top, gap, bottom, right } = FILTER_SPACING;

/** The expanded area under a row's header: its spacing, no frame. */
export const filterArea = `
  margin-top: ${top};
  padding-right: calc(${right} - ${entryRight});

  &:last-child {
    padding-bottom: calc(${bottom} - ${entryBottom});
  }
`;

/** One filter in an expanded row: its header, then its body. */
export const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${top};
  ${filterArea}
  font-weight: bold;

  & + & {
    margin-top: ${gap};
  }
`;

/** An expanded filter's body: no frame of its own, the row's color bar is it. */
export const FilterBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${gap};
  color: ${cssVar.color.text.secondary};
`;

/** The filter-mode row and Reset, sharing one line; gone when both are. */
export const ActionRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${gap};

  &:empty {
    display: none;
  }
`;

/** A filter input's only line: an underline in the field's color. */
export const underline = (color: string) => ({
  className: styles.underline,
  style: { "--field-color": color } as CSSProperties,
});
