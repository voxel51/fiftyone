import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Checkbox } from "@mui/material";
import Color from "color";
import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import FieldLabelAndInfo from "../../../FieldLabelAndInfo";
import RegularEntry from "../RegularEntry";
import { makePseudoField, pathIsExpanded } from "../utils";
import FilterablePathEntries from "./FilterablePathEntries";
import LightningFilterablePathEntries from "./LightningFilterablePathEntries";
import createTitleTemplate from "./createTitleTemplate";

const useOnClick = ({
  disabled,
  modal,
  path,
}: {
  disabled: boolean;
  modal: boolean;
  path: string;
}) => {
  return useRecoilCallback<[React.MouseEvent<HTMLButtonElement>], void>(
    ({ set }) =>
      async (event) => {
        if (disabled) return;
        const checked = (event.target as HTMLInputElement).checked;
        set(fos.activeField({ modal, path }), checked);
      },
    [disabled, modal, path]
  );
};

const FilterableEntry = ({
  entryKey,
  modal,
  path,
  onFocus,
  onBlur,
  disabled = false,
  trigger,
}: {
  disabled?: boolean;
  entryKey: string;
  group: string;
  modal: boolean;
  path: string;
  onFocus?: () => void;
  onBlur?: () => void;
  trigger?: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const active = useRecoilValue(fos.activeField({ modal, path }));
  const activeColor = useRecoilValue(fos.pathColor(path));

  const theme = useTheme();
  const color = disabled ? theme.background.level2 : activeColor;

  const expandedPath = useRecoilValue(fos.expandPath(path));
  const expanded = useRecoilValue(
    pathIsExpanded({ modal, path: expandedPath })
  );

  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const field = useRecoilValue(fos.field(path));
  const pseudoField = makePseudoField(path);
  const fieldIsFiltered = useRecoilValue(fos.fieldIsFiltered({ path, modal }));

  const onClick = useOnClick({ disabled, modal, path });
  const isLabelTag = path === "_label_tags";
  const lightning = useRecoilValue(fos.isLightningPath(path));

  const Entries = lightning
    ? LightningFilterablePathEntries
    : FilterablePathEntries;

  return (
    <RegularEntry
      backgroundColor={
        fieldIsFiltered
          ? Color(color).alpha(0.25).string()
          : theme.background.level1
      }
      color={color}
      entryKey={entryKey}
      heading={
        <>
          {!disabled && !(modal && isLabelTag) && (
            <Checkbox
              checked={active}
              title={`Show ${path}`}
              style={{
                color: active ? color : theme.text.secondary,
                marginLeft: 2,
                padding: 0,
              }}
              key="checkbox"
              data-cy={`checkbox-${path}`}
              onClick={onClick}
            />
          )}
          {
            <FieldLabelAndInfo
              field={field ?? pseudoField}
              path={path}
              color={color}
              expandedPath={expandedPath}
              template={createTitleTemplate({
                color,
                disabled,
                expandedPath,
                lightning,
                modal,
                path,
                showCounts: isFilterMode,
              })}
            />
          }
        </>
      }
      trigger={trigger}
    >
      {expanded && (
        <Entries
          {...{
            modal,
            onBlur,
            onFocus,
            path,
          }}
        />
      )}
    </RegularEntry>
  );
};

export default React.memo(FilterableEntry);
