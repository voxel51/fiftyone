import React, { Fragment, useMemo, useRef } from "react";
import Draggable from "react-draggable";
import ReactDOM from "react-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";

import * as fos from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import { Popout, Tooltip } from "@fiftyone/components";
import Item from "../Filters/categoricalFilter/filterOption/FilterItem";
import GlobalSetting from "./GlobalSetting";
import FieldSetting from "./FieldSetting";
import { useOutsideClick } from "@fiftyone/state";
import useMeasure from "react-use-measure";
import JSONViewer from "./JSONViewer";
import ColorFooter from "./ColorFooter";
import {
  Container,
  Display,
  DraggableContent,
  DraggableModalTitle,
  ModalWrapper,
} from "./ShareStyledDiv";

import SidebarList from "./SidebarList";

const ColorModal = () => {
  const ref = React.useRef<HTMLDivElement>();
  const [open, setOpen] = React.useState(false);
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();
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
                <div style={{ margin: "4px" }}>Color Scheme</div>
                <CloseIcon
                  onClick={() => setActiveColorModalField(null)}
                  style={{ margin: "4px" }}
                />
              </DraggableModalTitle>
              <DraggableContent>
                <SidebarList />
                <Display>
                  {field === "global" && <GlobalSetting />}
                  {field === "json" && <JSONViewer />}
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
