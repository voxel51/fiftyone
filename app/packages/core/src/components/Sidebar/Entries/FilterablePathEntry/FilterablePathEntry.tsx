import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { makePseudoField } from "@fiftyone/utilities";
import { Checkbox } from "@mui/material";
import Color from "color";
import React, { Suspense } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import FieldLabelAndInfo from "../../../FieldLabelAndInfo";
import RegularEntry from "../RegularEntry";
import FilterablePathEntries from "./FilterablePathEntries";
import Loading from "./Loading";
import useTitleTemplate from "./useTitleTemplate";

const LABEL_TAGS = "_label_tags";

const useOnClick = ({ modal, path }: { modal: boolean; path: string }) => {
  return useRecoilCallback<[React.MouseEvent<HTMLButtonElement>], void>(
    ({ set }) =>
      async (event) => {
        const checked = (event.target as HTMLInputElement).checked;
        set(fos.activeField({ modal, path }), checked);
      },
    [modal, path]
  );
};

const useField = (path: string) =>
  useRecoilValue(fos.field(path)) || makePseudoField(path);

const FilterableEntry = ({
  disabled,
  entryKey,
  modal,
  path,
  onFocus,
  onBlur,
  trigger,
}: {
  disabled: boolean;
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
  const pathColor = useRecoilValue(fos.pathColor(path));
  const field = useField(path);
  const fieldIsFiltered = useRecoilValue(fos.fieldIsFiltered({ path, modal }));
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const expanded = useRecoilValue(
    fos.sidebarExpanded({ modal, path: expandedPath })
  );
  const onClick = useOnClick({ modal, path });
  const theme = useTheme();
  const color = disabled ? theme.background.paper : pathColor;

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
          {!disabled && !(modal && path === LABEL_TAGS) && (
            <Checkbox
              key="checkbox"
              checked={active}
              title={`Show ${path}`}
              style={{
                color: active ? color : theme.text.secondary,
                marginLeft: 2,
                padding: 0,
              }}
              data-cy={`checkbox-${path}`}
              onClick={onClick}
            />
          )}
          {
            <FieldLabelAndInfo
              key={"info"}
              field={field}
              path={path}
              color={color}
              expandedPath={expandedPath}
              template={useTitleTemplate({
                modal,
                path,
              })}
            />
          }
        </>
      }
      trigger={trigger}
    >
      {expanded && (
        <Suspense fallback={<Loading />}>
          <FilterablePathEntries
            {...{
              modal,
              onBlur,
              onFocus,
              path,
            }}
          />
        </Suspense>
      )}
    </RegularEntry>
  );
};

export default React.memo(FilterableEntry);
