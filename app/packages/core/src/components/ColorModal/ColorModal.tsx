import * as fos from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import CloseIcon from "@mui/icons-material/Close";
import React, { Fragment, useCallback, useRef, useState } from "react";
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

import { ExternalLink, InfoIcon, useTheme } from "@fiftyone/components";
import Typography from "@mui/material/Typography";
import { Resizable } from "re-resizable";
import { resizeHandle } from "./../Sidebar/Sidebar.module.css";
import SidebarList from "./SidebarList";
import { ACTIVE_FIELD } from "./utils";

const CUSTOM_COLOR_DOCUMENTATION_LINK =
  "https://docs.voxel51.com/user_guide/app.html#app-color-schemes";

const ColorModal = () => {
  const theme = useTheme();
  const field = useRecoilValue(fos.activeColorField);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const targetContainer = document.getElementById("colorModal");
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const [width, setWidth] = useState(860);
  const [height, setHeight] = useState(680);

  const keyboardHandler = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === "INPUT") {
        if ((active as HTMLInputElement).type === "text") {
          return;
        }
      }
      if (e.key === "Escape") {
        setActiveColorModalField(null);
      }
    },
    [setActiveColorModalField]
  );

  fos.useEventHandler(document, "keydown", keyboardHandler);

  if (targetContainer) {
    return ReactDOM.createPortal(
      <Fragment>
        <ModalWrapper
          ref={wrapperRef}
          onClick={(event) =>
            event.target === wrapperRef.current &&
            setActiveColorModalField(null)
          }
          aria-labelledby="draggable-color-modal"
        >
          <Draggable bounds="parent" handle=".draggable-colorModal-handle">
            <Resizable
              size={{ height, width }}
              minWidth={600}
              minHeight={500}
              enable={{
                top: true,
                right: true,
                left: true,
                bottom: true,
                topRight: true,
                bottomRight: true,
                bottomLeft: true,
                topLeft: true,
              }}
              onResizeStop={(e, direction, ref, { width: dw, height: dh }) => {
                setWidth(width + dw);
                setHeight(height + dh);
                if (e.detail === 2) {
                  setWidth(860);
                  setHeight(680);
                }
              }}
              handleStyles={{
                ["right"]: { right: 0, width: 4 },
                ["left"]: { left: 0, width: 4 },
                ["top"]: { top: 0, height: 4 },
                ["bottom"]: { bottom: 0, height: 4 },
              }}
              handleClasses={{
                ["right"]: resizeHandle,
                ["left"]: resizeHandle,
                ["top"]: resizeHandle,
                ["bottom"]: resizeHandle,
              }}
            >
              <Container height={height} width={width}>
                <DraggableModalTitle className="draggable-colorModal-handle">
                  <Typography
                    component="h1"
                    color={theme.text.primary}
                    fontSize="1.5rem"
                    style={{
                      width: "100%",
                      margin: "4px",
                    }}
                  >
                    Color scheme
                  </Typography>
                  <ExternalLink
                    style={{
                      color: theme.text.secondary,
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      margin: "auto 4px",
                    }}
                    title="Documentation"
                    href={CUSTOM_COLOR_DOCUMENTATION_LINK}
                  >
                    <InfoIcon />
                  </ExternalLink>
                  <CloseIcon
                    onClick={() => setActiveColorModalField(null)}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ margin: "auto 4px", cursor: "pointer" }}
                  />
                </DraggableModalTitle>
                <DraggableContent height={height} width={width}>
                  <SidebarList />
                  <Display>
                    {field === ACTIVE_FIELD.global && <GlobalSetting />}
                    {field === ACTIVE_FIELD.json && <JSONViewer />}
                    {typeof field !== "string" && field && (
                      <FieldSetting prop={activeColorModalField} />
                    )}
                  </Display>
                </DraggableContent>
                <ColorFooter />
              </Container>
            </Resizable>
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
