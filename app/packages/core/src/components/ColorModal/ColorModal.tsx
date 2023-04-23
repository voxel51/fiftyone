import React, { Fragment, useMemo, useRef } from "react";
import Draggable from "react-draggable";
import ReactDOM from "react-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";

import * as fos from "@fiftyone/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  VALID_LABEL_TYPES,
} from "@fiftyone/utilities";
import { Popout, Tooltip } from "@fiftyone/components";
import Item from "../Filters/categoricalFilter/filterOption/FilterItem";
import GlobalSetting from "./GlobalSetting";
import FieldSetting from "./FieldSetting";
import { useOutsideClick } from "@fiftyone/state";
import useMeasure from "react-use-measure";
import JSONViewer from "./JSONViewer";
import ColorFooter from "./ColorFooter";
import {
  ActionDiv,
  Container,
  DraggableContent,
  DraggableModalTitle,
  IconDiv,
  ModalWrapper,
  Text,
} from "./ShareStyledDiv";

type Option = {
  value: string;
  onClick: () => void;
};

const ColorModal = () => {
  const ref = React.useRef<HTMLDivElement>();
  const [open, setOpen] = React.useState(false);
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

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
    {
      value: "JSON viewer",
      onClick: () => {
        setActiveColorModalField("json");
        setOpen(false);
      },
      tooltip: "Edit all settings in JSON",
    },
  ]);

  const selected = useMemo(() => {
    if (activeColorModalField == "global") return "global";
    if (activeColorModalField == "json") return "JSON viewer";
    return activeColorModalField?.path ?? "";
  }, [activeColorModalField]);

  const height = activeColorModalField == "json" ? "80vh" : "60vh";
  const width = activeColorModalField == "json" ? "80vw" : "50vw";
  const minWidth = activeColorModalField == "json" ? "600px" : "500px";

  const ColorModalTitle = () => {
    return (
      <ActionDiv ref={ref}>
        <Tooltip
          text={"Click to change to a different field for color settings"}
          placement={"top-center"}
        >
          <Text onClick={() => setOpen((o) => !o)} ref={mRef}>
            <IconDiv>
              {" "}
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
          <Popout style={{ padding: 0, position: "relative" }} bounds={bounds}>
            {options.map((option: Option) => (
              <Item key={option.value} {...option} />
            ))}
          </Popout>
        )}
      </ActionDiv>
    );
  };

  if (targetContainer) {
    return ReactDOM.createPortal(
      <Fragment>
        <ModalWrapper
          ref={wrapperRef}
          onClick={(event) => event.target === wrapperRef.current}
          aria-labelledby="draggable-color-modal"
        >
          <Draggable bounds="parent" handle=".draggable-colorModal-handle">
            <Container height={height} width={width} minWidth={minWidth}>
              <DraggableModalTitle className="draggable-colorModal-handle">
                <ColorModalTitle />
                <CloseIcon onClick={() => setActiveColorModalField(null)} />
              </DraggableModalTitle>
              <DraggableContent
                height={height}
                width={width}
                minWidth={minWidth}
              >
                {field === "global" && <GlobalSetting />}
                {field === "json" && <JSONViewer />}
                {typeof field !== "string" && field && (
                  <FieldSetting field={activeColorModalField as Field} />
                )}
              </DraggableContent>
              <ColorFooter eligibleFields={customizeColorFields} />
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
