import { cssVar } from "@voxel51/voodo";
import type { CSSProperties } from "react";
import styled from "styled-components";
import styles from "./underline.module.css";

/** Expanded filter spacing; VOODO's scale has no 12px step. */
export const FILTER_SPACING = {
  // the field name's indent: a 14px checkbox and the label's 6px margin
  left: "20px",
  right: "12px",
  // the row's header to the first control
  top: "8px",
  // the last control to the next field
  bottom: "12px",
  // between stacked controls
  gap: "10px",
};

const { left, right, top, bottom, gap } = FILTER_SPACING;

/** The expanded area under a row's header, inset from its color bar. */
export const filterArea = `
  margin-top: ${top};
  padding: 0 ${right} ${bottom} ${left};
`;

/** One filter in an expanded row: its header, then its body. */
export const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${top};
  ${filterArea}
  font-weight: bold;

  & + & {
    margin-top: 0;
  }
`;

/** An expanded filter's body: no frame of its own, the row's color bar is it. */
export const FilterBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${gap};
  color: ${cssVar.color.text.secondary};
`;

/** A filter input's only line: an underline in the field's color. */
export const underline = (color: string) => ({
  className: styles.underline,
  style: { "--field-color": color } as CSSProperties,
});
