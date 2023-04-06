import React, { Fragment, useMemo, useRef } from "react";
import Draggable from "react-draggable";
import ReactDOM from "react-dom";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";

import * as fos from "@fiftyone/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  VALID_LABEL_TYPES,
  withPath,
} from "@fiftyone/utilities";
import { Popout, Tooltip, useTheme } from "@fiftyone/components";
import Item from "../Filters/categoricalFilter/filterOption/FilterItem";
import GlobalSetting from "./GlobalSetting";
import FieldSetting from "./FieldSetting";
import { Button } from "../utils";
import { tempColorSetting } from "./utils";

const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

const Container = styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: start;
  overflow: hidden;
  box-shadow: 0 20px 25px -20px #000;
`;

const DraggableModalTitle = styled.div`
  flex-direction: row;
  display: flex;
  justify-content: space-between;
  width: 100%;
  height: 2.5rem;
  background-color: ${({ theme }) => theme.background.level1};
  padding: 2px;
  cursor: pointer;
  fontweight: 600;
`;

const ModalActionButtonContainer = styled.div`
  align-self: flex-end;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  padding: 0.5rem;
`;

const BUTTON_STYLE: React.CSSProperties = {
  margin: "0.5rem 1rem",
  height: "2rem",
  width: "6rem",
  flex: 1,
  textAlign: "center",
};

const ActionDiv = styled.div`
  position: relative;
`;

const IconDiv = styled.div`
  margin: auto 0.25rem;
  align-items: center;
`;

type Option = {
  value: string;
  onClick: () => void;
};

const screen = {
  minWidth: "500px",
  width: "40vw",
  height: "80vh",
};

const Text = styled.div`
  font-size: 1.1rem;
  text-transform: uppercase;
  width: 100%;
  display: flex;
  flex-direction: row;
  cursor: pointer;
`;

const ColorModal = () => {
  const ref = React.useRef<HTMLDivElement>();
  const [open, setOpen] = React.useState(false);
  const field = useRecoilValue(fos.activeColorField);

  // get all the embeddedDocfields that can be customized:
  const customizeColorFields = useRecoilValue(
    fos.fields({
      space: fos.State.SPACE.SAMPLE,
      ftype: EMBEDDED_DOCUMENT_FIELD,
    })
  )?.filter((f) =>
    VALID_LABEL_TYPES.includes(
      f?.embeddedDocType?.split(".")?.slice(-1)[0] ?? ""
    )
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const targetContainer = document.getElementById("colorModal");
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );

  const fieldOptions = customizeColorFields.map((field) => ({
    value: field.path ?? "",
    tooltip: `customize annotation for field ${field.name}`,
    onClick: () => {
      setActiveColorModalField(field as Field);
      setOpen(false);
    },
  }));

  const options = fieldOptions.concat([
    {
      value: "global",
      onClick: () => {
        setActiveColorModalField("global");
        setOpen(false);
      },
      tooltip: "global annotation settings",
    },
  ]);

  const selected = useMemo(() => {
    if (activeColorModalField == "global") return "global";
    return activeColorModalField?.path ?? "";
  }, [activeColorModalField]);

  if (targetContainer) {
    return ReactDOM.createPortal(
      <Fragment>
        <ModalWrapper
          ref={wrapperRef}
          onClick={(event) => event.target === wrapperRef.current}
          aria-labelledby="draggable-color-modal"
        >
          <Draggable bounds="parent" handle=".draggable-colorModal-handle">
            <Container style={{ ...screen, zIndex: 2 }}>
              <DraggableModalTitle className="draggable-colorModal-handle">
                <div>
                  <ActionDiv ref={ref}>
                    <Tooltip
                      text={"Click to change target field for setup"}
                      placement={"top-center"}
                    >
                      <Text onClick={() => setOpen((o) => !o)}>
                        <IconDiv>
                          {open ? (
                            <KeyboardArrowUpOutlinedIcon />
                          ) : (
                            <KeyboardArrowDownOutlinedIcon />
                          )}
                        </IconDiv>
                        <div>{selected}</div>
                      </Text>
                    </Tooltip>
                    {open && (
                      <Popout style={{ padding: 0, position: "relative" }}>
                        {options.map((option: Option) => (
                          <Item key={option.value} {...option} />
                        ))}
                      </Popout>
                    )}
                  </ActionDiv>
                </div>
                <CloseIcon onClick={() => setActiveColorModalField(null)} />
              </DraggableModalTitle>
              <div style={{ height: "calc( 80vh - 6rem)", overflow: "auto" }}>
                {typeof field === "string" ? (
                  <GlobalSetting />
                ) : (
                  <FieldSetting />
                )}
              </div>
              <SubmitControls />
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

const SubmitControls = () => {
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  if (!activeColorModalField) return null;
  const path =
    activeColorModalField == "global" ? "global" : activeColorModalField.path;
  const [tempColor, setTempColor] = useRecoilState(tempColorSetting);
  const setCustomizeColor = useSetRecoilState(
    fos.customizeColorSelector(path!)
  );
  const [customizeColorFields, setCustomizeColorFields] = useRecoilState(
    fos.customizeColorFields
  );

  const onCancel = () => {
    setActiveColorModalField(null);
    setTempColor(null);
  };

  const onSave = () => {
    console.log("onSave");
    setActiveColorModalField(null);
    setCustomizeColor(tempColor);
    setTempColor(null);
  };

  return (
    <ModalActionButtonContainer>
      <Button
        text={"Save"}
        title={`Save`}
        onClick={onSave}
        style={BUTTON_STYLE}
      />
      <Button
        text={"Cancel"}
        title={`Cancel`}
        onClick={onCancel}
        style={BUTTON_STYLE}
      />
    </ModalActionButtonContainer>
  );
};
