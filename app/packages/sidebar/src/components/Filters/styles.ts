import { cssVar } from "@voxel51/voodo";
import type { CSSProperties } from "react";
import styled from "styled-components";
import styles from "./underline.module.css";

/** One filter in an expanded row: its header, then its body, evenly spaced. */
export const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-weight: bold;
`;

/** An expanded filter's body: no frame of its own, the row's color bar is it. */
export const FilterBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: ${cssVar.color.text.secondary};
`;

/** A filter input's only line: an underline in the field's color. */
export const underline = (color: string) => ({
  className: styles.underline,
  style: { "--field-color": color } as CSSProperties,
});
