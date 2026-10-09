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
 * shows or hides the field's box outlines. It has no filter.
 */
const BoundingBoxFilter = ({ color, labelPath, path }: Props) => {
  const field = fos.useField(path);
  const isShown = fos.useBoundingBoxVisibility(labelPath ?? "");
  const toggle = fos.useToggleBoundingBoxVisibility(labelPath ?? "");

  if (!field || !labelPath) {
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
