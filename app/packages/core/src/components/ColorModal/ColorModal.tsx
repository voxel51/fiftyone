import React, { Fragment, useMemo, useRef } from "react";
import Draggable from "react-draggable";
import ReactDOM from "react-dom";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
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
import { Button } from "../utils";
import {
  tempColorJSON,
  tempColorSetting,
  tempGlobalSetting,
  updateFieldSettings,
  validateJSONSetting,
} from "./utils";
import { CustomizeColor, useOutsideClick } from "@fiftyone/state";
import useMeasure from "react-use-measure";
import JSONViewer from "./JSONViewer";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { cloneDeep } from "lodash";

const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000000;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

type ContainerProp = {
  height: string;
  width: string;
  minWidth: string;
};

const Container = styled.div<ContainerProp>`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: start;
  overflow: hidden;
  box-shadow: 0 20px 25px -20px #000;
  min-width: ${({ minWidth }) => minWidth};
  width: ${({ width }) => width};
  height: ${({ height }) => height};
`;

const DraggableContent = styled.div<ContainerProp>`
  height: ${({ height }) => `calc(${height} - 6rem)`};
  overflow: auto;
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

const Text = styled.div`
  font-size: 1.1rem;
  text-transform: uppercase;
  width: 100%;
  display: flex;
  flex-direction: row;
  cursor: pointer;
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
              <SubmitControls eligibleFields={customizeColorFields} />
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

type Prop = {
  eligibleFields: Field[];
};

const SubmitControls: React.FC<Prop> = ({ eligibleFields }) => {
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const [tempGlobalSettings, setTempGlobalSettings] =
    useRecoilState(tempGlobalSetting);
  const [json, setJson] = useRecoilState(tempColorJSON);
  const customizeColorFields = useRecoilValue(fos.customizeColorFields);
  const path =
    typeof activeColorModalField === "string"
      ? activeColorModalField
      : activeColorModalField?.path;

  const [tempColor, setTempColor] = useRecoilState(tempColorSetting);
  const setAlpha = useSetRecoilState(fos.alpha(false));
  const setConfigColorBy = useSetRecoilState(
    fos.appConfigOption({ modal: false, key: "colorBy" })
  );
  const setShowSkeleton = useSetRecoilState(
    fos.appConfigOption({ key: "showSkeletons", modal: false })
  );
  const setMulticolorKeypoints = useSetRecoilState(
    fos.appConfigOption({ key: "multicolorKeypoints", modal: false })
  );
  const setColoring = useSetRecoilState(fos.colorPalette);
  const setCustomizeColor = useSetRecoilState(
    fos.customizeColorSelector(path!)
  );

  const onCancel = () => {
    setActiveColorModalField(null);
    setTempColor(null);
    setTempGlobalSettings(null);
    setJson(null);
  };

  const onSave = () => {
    onApply();
    onCancel();
  };

  const onApply = () => {
    if (typeof activeColorModalField !== "string") {
      // save field settings (update tempcolor by checkbox options)
      const update = updateFieldSettings(tempColor);
      setCustomizeColor(update);
    }
    if (activeColorModalField == "global") {
      // save global settings
      const { colorBy, colors, opacity, useMulticolorKeypoints, showSkeleton } =
        tempGlobalSettings ?? {};
      setConfigColorBy(colorBy);
      setColoring(colors);
      setAlpha(opacity);
      setMulticolorKeypoints(useMulticolorKeypoints);
      setShowSkeleton(showSkeleton);
    }
    if (activeColorModalField == "json") {
      if (
        typeof json !== "object" ||
        !json?.colorScheme ||
        !Array.isArray(json?.colorScheme) ||
        !json?.customizedColorSettings ||
        !Array.isArray(json?.customizedColorSettings)
      )
        return;
      const { colorScheme, customizedColorSettings } = json;
      // update color palette
      const validColors = colorScheme?.filter((c) => isValidColor(c));
      validColors.length > 0 && setColoring(validColors);
      // validate customizedColorSettings
      const validated = validateJSONSetting(
        customizedColorSettings,
        eligibleFields
      );
      if (validated) {
        resetCustomizeColors(validated);
        validated.forEach((update) => setCustomizeColor(update));
      }
    }
  };

  const resetCustomizeColors =
    useOverwriteCustomizeColors(customizeColorFields);

  function useOverwriteCustomizeColors(customizeColorFields: string[]) {
    return useRecoilCallback(({ set }) => (newValues: CustomizeColor[]) => {
      const newKeys = newValues.map((v) => v.field);
      customizeColorFields.forEach((key) => {
        if (newKeys.includes(key)) {
          set(
            fos.customizeColorSelector(key),
            newValues.find((v) => v.field === key)!
          );
        } else {
          set(fos.customizeColorSelector(key), {});
        }
      });
    });
  }

  if (!activeColorModalField) return null;

  return (
    <ModalActionButtonContainer>
      <Button
        text={"Apply"}
        title={`Apply`}
        onClick={onApply}
        style={BUTTON_STYLE}
      />
      <Button
        text={"Save"}
        title={`Save`}
        onClick={onSave}
        style={BUTTON_STYLE}
      />
      <Button
        text={"Close"}
        title={`Close`}
        onClick={onCancel}
        style={BUTTON_STYLE}
      />
    </ModalActionButtonContainer>
  );
};
