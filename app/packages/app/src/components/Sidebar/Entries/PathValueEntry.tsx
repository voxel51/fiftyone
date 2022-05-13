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

import * as atoms from "../../../recoil/atoms";
import * as colorAtoms from "../../../recoil/color";
import * as schemaAtoms from "../../../recoil/schema";
import * as selectors from "../../../recoil/selectors";
import { prettify } from "../../../utils/generic";

import { NameAndCountContainer } from "../../utils";

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
  value,
  path,
}: {
  path: string;
  value: unknown;
}) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const color = useRecoilValue(colorAtoms.pathColor({ path, modal: true }));
  const timeZone = useRecoilValue(selectors.timeZone);
  const none = value === null || value === undefined;
  const { ftype, subfield, embeddedDocType } = useRecoilValue(
    schemaAtoms.field(path)
  );

  const formatted = format({ ftype, value, timeZone });

  return (
    <RegularEntry
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

const ListValueEntry = ({ path, data }: { path: string; data: unknown[] }) => {
  const [expanded, setExpanded] = useState(false);
  const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;

  const values = useMemo(() => {
    return data ? data.map((value) => prettify(value as string)) : [];
  }, [data]);
  const expandable = values && values.length;
  const count = prettify(values.length);
  const color = useRecoilValue(colorAtoms.pathColor({ path, modal: true }));
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const { ftype, subfield, embeddedDocType } = useRecoilValue(
    schemaAtoms.field(path)
  );

  const canExpand = Boolean(values.length);

  useLayoutEffect(() => {
    !canExpand && expanded && setExpanded(false);
  }, [canExpand, expanded]);

  if (!data) {
    return <ScalarValueEntry value={null} path={path} />;
  }

  return (
    <RegularEntry
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

const PathValueEntry = ({ path }: { path: string }) => {
  const keys = path.split(".");

  let field = useRecoilValue(schemaAtoms.field(keys[0]));
  let { sample: data } = useRecoilValue(atoms.modal);

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
    return <ScalarValueEntry path={path} value={data as unknown} />;
  }

  return <ListValueEntry path={path} data={(data as unknown) as unknown[]} />;
};

export default React.memo(PathValueEntry);
