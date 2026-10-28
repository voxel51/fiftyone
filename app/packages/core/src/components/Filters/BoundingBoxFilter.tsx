import * as fos from "@fiftyone/state";
import styled from "styled-components";
import FieldLabelAndInfo from "../FieldLabelAndInfo";
import { AttributeEye } from "./use-label-attribute-icon";

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
  labelPath?: string;
  modal: boolean;
  path: string;
};

/**
 * A detection field's `bounding_box` sidebar row: a header whose eyeball
 * shows or hides the field's box outlines. It has no filter. Like the other
 * attribute rows, it hides when the sample has no labels in the field.
 */
const BoundingBoxFilter = ({ color, labelPath, modal, path }: Props) => {
  const field = fos.useField(path);
  const isShown = fos.useBoundingBoxVisibility(labelPath ?? "");
  const toggle = fos.useToggleBoundingBoxVisibility(labelPath ?? "");
  // count labels like the field's badge does: at the expanded path this row
  // sits under, e.g. "ground_truth.detections"
  const labelCount = fos.useSidebarPathCount({
    path: path.split(".").slice(0, -1).join("."),
    modal,
  });

  if (!field || !labelPath || !labelCount) {
    return null;
  }

  return (
    <Container
      data-cy={`bounding-box-filter-${path}`}
      onClick={(e) => e.stopPropagation()}
    >
      <FieldLabelAndInfo
        nested
        field={field}
        color={color}
        template={({ label, hoverTarget }) => (
          <Header>
            <span ref={hoverTarget}>{label}</span>
            <AttributeEye
              attribute="bounding_box"
              color={color}
              dataCy={`shown-attribute-${path}`}
              isShown={isShown}
              onToggle={toggle}
            />
          </Header>
        )}
      />
    </Container>
  );
};

export default BoundingBoxFilter;
