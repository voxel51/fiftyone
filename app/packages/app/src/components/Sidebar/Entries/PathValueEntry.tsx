import { useTheme } from "@fiftyone/components";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  formatDate,
  formatDateTime,
  FRAME_SUPPORT_FIELD,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { KeyboardArrowDown, KeyboardArrowUp } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React, { useLayoutEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

import { prettify } from "../../../utils/generic";

import { NameAndCountContainer } from "../../utils";
import * as fos from "@fiftyone/state";

import RegularEntry from "./RegularEntry";

const ScalarDiv = styled.div`
  & > div {
    user-select: text;
    font-weight: bold;
    padding: 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const format = ({
  ftype,
  timeZone,
  value,
}: {
  ftype: string;
  timeZone: string;
  value: unknown;
}) => {
  if (value === undefined) return value;

  if (value === null) return;

  switch (ftype) {
    case FRAME_SUPPORT_FIELD:
      value = `[${value[0]}, ${value[1]}]`;
    case DATE_FIELD:
      // @ts-ignore
      value = formatDate(value.datetime as number);
    case DATE_TIME_FIELD:
      // @ts-ignore
      value = formatDateTime(value.datetime as number, timeZone);
  }

  return prettify(value as string);
};

const ScalarValueEntry = ({
  entryKey,
  path,
  trigger,
  value,
}: {
  entryKey: string;
  path: string;
  value: unknown;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const color = useRecoilValue(fos.pathColor({ path, modal: true }));
  const timeZone = useRecoilValue(fos.timeZone);
  const none = value === null || value === undefined;
  const { ftype, subfield, embeddedDocType } = useRecoilValue(fos.field(path));

  const formatted = format({ ftype, value, timeZone });

  return (
    <RegularEntry
      entryKey={entryKey}
      title={`${path} (${
        embeddedDocType
          ? embeddedDocType
          : subfield
          ? `${ftype}(${subfield})`
          : ftype
      })${value === undefined ? "" : `: ${formatted}`}`}
      backgroundColor={backgroundColor}
      color={color}
      heading={null}
      trigger={trigger}
    >
      <ScalarDiv>
        <div style={none ? { color } : {}}>{none ? "None" : formatted}</div>
        <div
          style={{
            fontSize: "0.8rem",
            color: theme.fontDark,
          }}
        >
          {path}
        </div>
      </ScalarDiv>
    </RegularEntry>
  );
};

const ListContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const ListValueEntry = ({
  entryKey,
  data,
  path,
  trigger,
}: {
  data: unknown[];
  entryKey: string;
  path: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;

  const values = useMemo(() => {
    return data ? data.map((value) => prettify(value as string)) : [];
  }, [data]);
  const expandable = values && values.length;
  const count = prettify(values.length);
  const color = useRecoilValue(fos.pathColor({ path, modal: true }));
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const { ftype, subfield, embeddedDocType } = useRecoilValue(fos.field(path));

  const canExpand = Boolean(values.length);

  useLayoutEffect(() => {
    !canExpand && expanded && setExpanded(false);
  }, [canExpand, expanded]);

  if (!data) {
    return <ScalarValueEntry value={null} path={path} />;
  }

  return (
    <RegularEntry
      entryKey={entryKey}
      title={`${path} (${
        embeddedDocType
          ? embeddedDocType
          : subfield
          ? `${ftype}(${subfield})`
          : ftype
      }): ${count}`}
      backgroundColor={backgroundColor}
      color={color}
      heading={
        <NameAndCountContainer>
          <span key="path">{path}</span>
          <span key="value">{values.length}</span>
          {expandable && (
            <Arrow
              key="arrow"
              style={{ cursor: "pointer", margin: 0 }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded(!expanded);
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
            />
          )}
        </NameAndCountContainer>
      }
      trigger={trigger}
    >
      {expanded && (
        <ListContainer>
          {values.map((v) => (
            <div>{v}</div>
          ))}
        </ListContainer>
      )}
    </RegularEntry>
  );
};

const PathValueEntry = ({
  entryKey,
  path,
  trigger,
}: {
  entryKey: string;
  path: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const keys = path.split(".");

  let field = useRecoilValue(fos.field(keys[0]));
  let { sample: data } = useRecoilValue(fos.modal);

  for (let index = 0; index < keys.length; index++) {
    if (!data) {
      break;
    }

    const key = keys[index];

    data = data[field.dbField || key];

    if (keys[index + 1]) {
      field = field.fields[keys[index + 1]];
    }
  }

  if (field.ftype !== LIST_FIELD) {
    return (
      <ScalarValueEntry
        entryKey={entryKey}
        path={path}
        trigger={trigger}
        value={data as unknown}
      />
    );
  }

  return (
    <ListValueEntry
      entryKey={entryKey}
      data={data as unknown as unknown[]}
      path={path}
      trigger={trigger}
    />
  );
};

export default React.memo(PathValueEntry);
