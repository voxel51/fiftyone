import { InfoIcon, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { activeColorField, coloring } from "@fiftyone/state";
import { Field, formatDate, formatDateTime } from "@fiftyone/utilities";
import PaletteIcon from "@mui/icons-material/Palette";
import React, {
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { ExternalLink } from "../../utils/generic";

const selectedFieldInfo = atom<string | null>({
  key: "selectedFieldInfo",
  default: null,
});

// a react hook that calls the given function after a user has hovered over
// the given element for a specified amount of time
const useHover = (ref, delay, onHover, onHoverEnd) => {
  const [hovering, setHovering] = useState(false);
  const timer = useRef<number>();

  const handleMouseOver = (e) => {
    timer.current = setTimeout(() => {
      setHovering(true);
      onHover && onHover(e);
    }, delay);
  };

  const handleMouseOut = (e) => {
    if (timer.current) clearTimeout(timer.current);
    setHovering(false);
    onHoverEnd && onHoverEnd(e);
  };

  useEffect(() => {
    const node = ref.current;
    if (node) {
      node.addEventListener("mouseover", handleMouseOver);
      node.addEventListener("mouseout", handleMouseOut);
      return () => {
        node.removeEventListener("mouseover", handleMouseOver);
        node.removeEventListener("mouseout", handleMouseOut);
      };
    }
  }, [ref.current]);

  return hovering;
};

function useFieldInfo(field, nested, { expandedPath, color }) {
  const instanceId = useMemo(() => Math.random().toString(36).substr(2, 9), []);
  const hoverTarget = useRef();
  const container = useRef();
  const expandedRef = useRef();
  const [open, setOpen] = useState(false);
  const [selectedField, setSelectedField] = useRecoilState(selectedFieldInfo);

  function onHover(e) {
    setSelectedField(instanceId);
  }
  function onHoverEnd(e) {
    if (e.relatedTarget === expandedRef.current) return;
    setSelectedField(null);
  }

  const delay = 500;
  useHover(hoverTarget, delay, onHover, onHoverEnd);

  useEffect(() => {
    setOpen(selectedField === instanceId);
  }, [selectedField]);

  return {
    open,
    hoverTarget,
    container,
    expandedRef,
    field,
    expandedPath,
    color,
    label: toLabel(field.path, nested),
    hoverHandlers: {},
    close() {
      setSelectedField(null);
    },
  };
}

function toLabel(path, nested) {
  return !nested ? path : path.split(".").pop();
}

const FieldInfoIcon = (props) => <InfoIcon {...props} style={{ opacity: 1 }} />;

type FieldLabelAndInfo = {
  nested?: boolean;
  field: Field;
  color: string;
  expandedPath?: string;
  template: (unknown) => JSX.Element;
};

const FieldLabelAndInfo = ({
  nested,
  field,
  color,
  expandedPath,
  template,
}: FieldLabelAndInfo) => {
  const fieldInfo = useFieldInfo(field, nested, { expandedPath, color });

  return (
    <>
      {template({ ...fieldInfo, FieldInfoIcon })}
      {field.path !== "_label_tags" && fieldInfo.open && (
        <FieldInfoExpanded {...fieldInfo} />
      )}
    </>
  );
};

export default FieldLabelAndInfo;

const FieldInfoExpandedContainer = styled.div`
  background: ${({ theme }) => {
    if (theme.mode === "light") {
      return theme.background.header;
    }
    return theme.background.body;
  }};
  border-left: 5px solid ${({ color }) => color};
  border-radius: 2px;
  padding: 0.5rem;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
`;

const FieldInfoDesc = styled.div<{ collapsed: boolean }>`
  text-overflow: ${({ collapsed }) => (collapsed ? "ellipsis" : "none")};
  white-space: ${({ collapsed }) => (collapsed ? "nowrap" : "pre-line")};
  height: ${({ collapsed }) => (collapsed ? "2.1rem" : "inherit")};
  font-size: 1rem;
  // margin: ${({ collapsed }) => (collapsed ? "0 0.25rem" : "0.25rem")};
  margin-top: -5px;
  padding: 0.2rem 0;
  line-height: 1.5rem;
  max-height: calc(2.1rem * 6);
  overflow-x: hidden;
  overflow-y: ${({ collapsed }) => (collapsed ? "hidden" : "auto")};
  color: ${({ theme }) => theme.text.primary};
  ::-webkit-scrollbar {
    width: 0.5rem; // manage scrollbar width here
  }
  ::-webkit-scrollbar * {
    background: #000; // manage scrollbar background color here
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(
      255,
      255,
      255,
      0.5
    ) !important; // manage scrollbar thumb background color here
  }
`;

const FieldInfoHoverTarget = styled.div`
  position: absolute;
  max-width: 400px;
  padding: 1rem;
  z-index: 9999;
`;

const ContentValue = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  color: ${({ theme }) => theme.text.primary};
`;

const ContentName = styled.div`
  // min-width: 50px;
  font-size: 0.8rem;
  font-weight: bold;
  color: ${({ theme }) => theme.text.secondary};
`;

// a styled.table that uses the theme
// to render a table with alternating
// background colors for rows
// and spaces out the rows and columns
const FieldInfoTableContainer = styled.table`
  border-collapse: collapse;
  width: 100%;
  td,
  th {
    padding: 0.1rem 0.5rem;
  }
  tr {
    background: ${({ theme }) => theme.background.level1};
  }
  tr {
    border-top: solid 2px ${({ theme }) => theme.background.header};
  }
  a,
  a:visited {
    color: ${({ theme }) => theme.text.primary};
  }
  tr td.nostretch {
    width: 1%;
    white-space: nowrap;
    vertical-align: top;
  }
`;

const ShowMoreLink = styled.a`
  font-size: 0.8rem;
  font-weight: bold;
  cursor: pointer;
  display: inline-block;
  text-align: right;
  color: ${({ theme }) => theme.text.primary};
  text-decoration: underline;
  margin-left: 0.25rem;
`;

function FieldInfoExpanded({
  field,
  hoverTarget,
  color,
  close,
  expandedPath,
  expandedRef,
}) {
  const el = expandedRef;
  const descTooLong = field.description && field.description.length > 250;
  const tooManyInfoKeys = field.info && Object.keys(field.info).length > 2;
  const [isCollapsed, setIsCollapsed] = useState(
    descTooLong || tooManyInfoKeys
  );

  const setIsCustomizingColor = useSetRecoilState(activeColorField);
  const updatePosition = () => {
    if (!el.current || !hoverTarget.current) return;
    el.current.style.visibility = "visible";
    const { top, left } = computePopoverPosition(el, hoverTarget);
    el.current.style.top = top + "px";
    el.current.style.left = left + "px";
  };
  const colorSettings = useRecoilValue(coloring);

  const colorBy = colorSettings.by;
  const onClickCustomizeColor = () => {
    // open the color customization modal based on colorBy status
    setIsCustomizingColor({ field, expandedPath });
  };

  useEffect(updatePosition, [field, isCollapsed]);
  const timeZone = useRecoilValue(fos.timeZone);
  const disabled = useRecoilValue(fos.disabledPaths);

  return ReactDOM.createPortal(
    <FieldInfoHoverTarget
      onMouseLeave={() => close()}
      ref={expandedRef}
      style={{ visibility: "hidden" }}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <FieldInfoExpandedContainer color={color}>
        {!disabled.has(field) && (
          <CustomizeColor
            onClick={onClickCustomizeColor}
            color={color}
            colorBy={colorBy}
          />
        )}
        {/* <FieldInfoTitle color={color}><span>{field.path}</span></FieldInfoTitle> */}
        {field.description && (
          <ExpFieldInfoDesc
            collapsed={descTooLong && isCollapsed}
            description={field.description}
          />
        )}
        {/* {field.description && <BorderDiv color={color} />} */}
        <FieldInfoTable
          {...field}
          collapsed={tooManyInfoKeys && isCollapsed}
          type={field.embeddedDocType || field.ftype}
          expandedPath={expandedPath}
          timeZone={timeZone}
          color={color}
        />
        {isCollapsed && (
          <ShowMoreLink
            onClick={() => {
              setIsCollapsed(false);
              updatePosition();
            }}
          >
            Show more...
          </ShowMoreLink>
        )}
      </FieldInfoExpandedContainer>
    </FieldInfoHoverTarget>,
    document.body
  );
}

type CustomizeColorProp = {
  color: string;
  onClick: () => void;
  colorBy: string;
};

const CustomizeColor: React.FunctionComponent<CustomizeColorProp> = ({
  ...props
}) => {
  return (
    <FieldInfoTableContainer onClick={props.onClick} color={props.color}>
      <tbody>
        <tr style={{ cursor: "pointer" }}>
          <td>
            <PaletteIcon sx={{ color: props.color }} fontSize={"small"} />
          </td>
          <td>
            <ContentValue>
              Customize colors by{" "}
              {props.colorBy == "field" ? "field" : "attribute value"}
            </ContentValue>
          </td>
        </tr>
      </tbody>
    </FieldInfoTableContainer>
  );
};

function ExpFieldInfoDesc({ collapsed, description }) {
  return (
    <FieldInfoDesc
      collapsed={collapsed}
      dangerouslySetInnerHTML={{ __html: description }}
    />
  );
}

// a function that returns a top and left
// position for a popover. The position
// must allow for the popover to fit on
// the screen. It should also position
// the popover above, below, left, or right
// of the target element
function computePopoverPosition(
  el: MutableRefObject<HTMLElement>,
  hoverTarget: MutableRefObject<HTMLElement>
) {
  const targetBounds = hoverTarget.current.getBoundingClientRect();
  const selfBounds = el.current.getBoundingClientRect();

  const offscreenArea = Infinity;
  let bestPosition: { top: number; left: number } | null = null;
  let bestScore = Infinity;
  const relativePositions = ["above", "below", "left", "right"];

  const windowBounds = {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // is the popover off the screen?
  while (offscreenArea > 0 && relativePositions.length) {
    const rel = relativePositions.pop();
    const position = computeRelativePosition(rel, targetBounds, selfBounds);
    const newSelfBounds = {
      height: selfBounds.height,
      width: selfBounds.width,
      ...position,
    };
    const { correction } = offscreenAreaOf(newSelfBounds, windowBounds);
    const correctedBounds = {
      ...newSelfBounds,
      top: newSelfBounds.top + correction.y,
      left: newSelfBounds.left + correction.x,
    };
    const delta = distanceFromCenters(correctedBounds, windowBounds);
    const score = delta;

    if (score < bestScore || bestPosition === null) {
      bestScore = score;
      bestPosition = {
        top: correctedBounds.top,
        left: correctedBounds.left,
      };
    }
  }

  return bestPosition as { top: number; left: number };
}

// a function that returns the area of the given
// popover that is off the screen
function offscreenAreaOf(position, windowBounds) {
  const { top, left, width, height } = position;
  const right = left + width;
  const bottom = top + height;
  const windowRight = windowBounds.left + windowBounds.width;
  const windowBottom = windowBounds.top + windowBounds.height;
  const leftOffscreen = Math.max(0, windowBounds.left - left);
  const rightOffscreen = Math.max(0, right - windowRight);
  const topOffscreen = Math.max(0, windowBounds.top - top);
  const bottomOffscreen = Math.max(0, bottom - windowBottom);
  return {
    area:
      leftOffscreen * height +
      rightOffscreen * height +
      topOffscreen * width +
      bottomOffscreen * width,
    correction: {
      x: leftOffscreen - rightOffscreen,
      y: topOffscreen - bottomOffscreen,
    },
  };
}

function getCenter(bounds) {
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

function distanceFromCenters(boundsA, boundsB) {
  const a = getCenter(boundsA);
  const b = getCenter(boundsB);
  return Math.abs(a.x - b.x);
  // return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function computeRelativePosition(relativePosition, targetBounds, selfBounds) {
  const targetCenter = getCenter(targetBounds);

  switch (relativePosition) {
    case "above":
      return {
        left: targetCenter.x - selfBounds.width / 2,
        top: targetBounds.top - selfBounds.height,
        relativePosition,
      };
    case "below":
      return {
        left: targetCenter.x - selfBounds.width / 2,
        top: targetBounds.top + targetBounds.height,
        relativePosition,
      };
    case "left":
      return {
        left: targetBounds.left - selfBounds.width,
        top: targetCenter.y - selfBounds.height / 2,
        relativePosition,
      };
    case "right":
      return {
        left: targetBounds.left + targetBounds.width,
        top: targetCenter.y - selfBounds.height / 2,
        relativePosition,
      };
    default:
      return { top: 0, left: 0, relativePosition };
  }
}

function entryKeyToLabel(key) {
  switch (key) {
    case "embeddedDocType":
      return "type";
  }
  return key;
}

// a react componont that renders a table
// given an object where the keys are the first column
// and the values are the second column
function FieldInfoTable({
  info,
  type,
  collapsed,
  subfield,
  description,
  timeZone,
  color,
}) {
  info = info || {};
  const tableData = info;
  let items = Object.entries<any>(tableData)
    .filter(keyValueIsRenderable)
    .map((v) => toRenderValue(v, timeZone));

  if (collapsed) {
    items = items.slice(0, 2);
  }

  return (
    <FieldInfoTableContainer color={color}>
      <tbody>
        {type && (
          <tr>
            <td
              className={
                items.length > 0 || description ? "nostretch" : undefined
              }
            >
              <ContentName>type</ContentName>
            </td>
            <td>
              <ContentValue>
                <LinkToType type={type} subfield={subfield} />
              </ContentValue>
            </td>
          </tr>
        )}
        {items.map(([key, value]) => (
          <tr key={key}>
            <td
              className={
                items.length > 0 || description ? "nostretch" : undefined
              }
            >
              <ContentName>{entryKeyToLabel(key)}</ContentName>
            </td>
            <td>
              <ContentValue>
                <LinkOrValue value={value} />
              </ContentValue>
            </td>
          </tr>
        ))}
      </tbody>
    </FieldInfoTableContainer>
  );
}

function keyValueIsRenderable([key, value]) {
  if (value === undefined || value === null) return true;
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return true;
    case "object":
      return ["Date", "DateTime"].includes(value._cls);
    default:
      return false;
  }
}
function toRenderValue([key, value], timeZone: string): [string, string] {
  switch (typeof value) {
    case "boolean":
      return [key, value ? "True" : "False"];
    case "object":
      if (value._cls === "Date") {
        return [key, formatDate(value.datetime)];
      } else if (value._cls === "DateTime") {
        return [key, formatDateTime(value.datetime, timeZone)];
      } else {
        return [key, ""];
      }
    default:
      return [key, value];
  }
}

function convertTypeToDocLink(type) {
  const parts: string[] = type.split(".");
  const modulePath: string[] = [];
  let className: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partLower = part.toLowerCase();
    if (partLower !== part) {
      className = part;
    } else {
      modulePath.push(part);
    }
  }
  const fullPath = [...modulePath, className].join(".");

  const BASE = "https://docs.voxel51.com/api/";

  if (className) {
    return {
      href: `${BASE}${modulePath.join(".")}.html#${fullPath}`,
      label: className,
    };
  }
  return {
    href: `${BASE}${modulePath.join(".")}.html`,
    label: modulePath.join("."),
  };
}

function LinkToType({ type, subfield }) {
  const theme = useTheme();
  const { href, label } = convertTypeToDocLink(type);
  return (
    <ExternalLink style={{ color: theme.text.primary }} href={href}>
      {label} {subfield ? `(${subfield})` : null}
    </ExternalLink>
  );
}

// a react component that returns a link
// if the given value is a string that is a valid url
// otherwise it returns the value
function LinkOrValue({ value }) {
  const theme = useTheme();
  if (typeof value !== "string" || !value.startsWith("http"))
    return <Value>{value}</Value>;

  const href = value;
  if (value.length > 50) {
    value = value.substr(0, 50) + "...";
  }

  return (
    <ExternalLink style={{ color: theme.text.primary }} href={href}>
      {value}
    </ExternalLink>
  );
}

function Value({ children }) {
  if (typeof children === "string") {
    return children; // TODO - support pre formatted text
  }
  return children;
}
