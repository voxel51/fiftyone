import * as fos from "@fiftyone/state";
import { useOutsideClick } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import CloseIcon from "@mui/icons-material/Close";
import React, { Fragment, useRef } from "react";
import ReactDOM from "react-dom";
import Draggable from "react-draggable";
import { useRecoilState, useRecoilValue } from "recoil";
import ColorFooter from "./ColorFooter";
import FieldSetting from "./FieldSetting";
import GlobalSetting from "./GlobalSetting";
import JSONViewer from "./JSONViewer";
import {
  Container,
  Display,
  DraggableContent,
  DraggableModalTitle,
  ModalWrapper,
} from "./ShareStyledDiv";

import SidebarList from "./SidebarList";
import { ACTIVE_FIELD } from "./utils";

const ColorModal = () => {
  const ref = React.useRef<HTMLDivElement>();
  const [open, setOpen] = React.useState(false);
  useOutsideClick(ref, () => open && setOpen(false));
  const field = useRecoilValue(fos.activeColorField);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const targetContainer = document.getElementById("colorModal");
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );

  if (targetContainer) {
    return ReactDOM.createPortal(
      <Fragment>
        <ModalWrapper
          ref={wrapperRef}
          onClick={(event) => event.target === wrapperRef.current}
          aria-labelledby="draggable-color-modal"
        >
          <Draggable bounds="parent" handle=".draggable-colorModal-handle">
            <Container>
              <DraggableModalTitle className="draggable-colorModal-handle">
                <div style={{ margin: "4px" }}>Edit color scheme</div>
                <CloseIcon
                  onClick={() => setActiveColorModalField(null)}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ margin: "4px", cursor: "pointer" }}
                />
              </DraggableModalTitle>
              <DraggableContent>
                <SidebarList />
                <Display>
                  {field === ACTIVE_FIELD.global && <GlobalSetting />}
                  {field === ACTIVE_FIELD.json && <JSONViewer />}
                  {typeof field !== "string" && field && (
                    <FieldSetting field={activeColorModalField as Field} />
                  )}
                </Display>
              </DraggableContent>
              <ColorFooter />
            </Container>
          </Draggable>
        </ModalWrapper>
      </Fragment>,
      targetContainer
    );
  } else {
    console.error("target container not found");
    return <></>;
  }
};

export default React.memo(ColorModal);
