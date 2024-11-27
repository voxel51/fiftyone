import {
  CONSTANT_VARIABLES,
  exportSelection,
  exportType,
} from "@fiftyone/teams-state";
import bytes from "bytes";
import { useEffect, useMemo } from "react";
import { useRecoilState, useResetRecoilState } from "recoil";
const { MAX_EXPORT_SIZE } = CONSTANT_VARIABLES;

const maxExportSizeInBytes = bytes(MAX_EXPORT_SIZE);

export function useExportView() {
  const [state, setState] = useRecoilState(exportSelection);
  const [type, setType] = useRecoilState(exportType);
  const reset = useResetRecoilState(exportSelection);

  function setData(data: string) {
    setState({
      ...state,
      data,
      format: "",
      field: "",
      fieldsAvailable: undefined,
      token: undefined,
      size: undefined,
    });
  }

  function setFormat(format: string) {
    setState({
      ...state,
      format,
      field: "",
      fieldsAvailable: undefined,
      token: undefined,
      size: undefined,
    });
  }

  function setField(field: string) {
    setState({ ...state, field, token: undefined });
  }

  function setFieldsAvailable(fieldsAvailable: Array<string>) {
    setState({ ...state, fieldsAvailable });
  }

  function setSize(size: number) {
    setState({ ...state, size });
  }

  function setExportToken(token: string) {
    setState({ ...state, token });
  }

  function setCloudStoragePath(path: string) {
    setState({ ...state, path });
  }

  const computedState = useMemo(() => {
    const { fieldsAvailable, field, size, data, path } = state;
    const hasLabels = data?.includes("labels");
    const hasMedia = data?.includes("media");
    const fieldIsNonEmpty = Array.isArray(field)
      ? field.length > 0
      : Boolean(field);
    const selectionIsValid =
      data && (fieldsAvailable?.length === 0 || fieldIsNonEmpty || !hasLabels);
    return {
      ...state,
      selectionIsValid,
      canExport: typeof size === "number" && size <= maxExportSizeInBytes,
      canCloudExport: typeof size === "number" && path,
      hasLabels,
      hasMedia,
    };
  }, [state]);

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      view: type,
    }));
  }, [type]);

  return {
    ...computedState,
    reset,
    setData,
    setFormat,
    setField,
    setSize,
    setExportToken,
    setFieldsAvailable,
    setCloudStoragePath,
  };
}
