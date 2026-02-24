import { useCallback, useMemo, useRef } from "react";

export function useFileInput(
  accept: string[] | undefined,
  multiple: boolean,
  onFiles: (files: File[]) => void
) {
  const ref = useRef<HTMLInputElement>(null);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        onFiles(Array.from(e.target.files));
      }
      e.target.value = "";
    },
    [onFiles]
  );

  const browse = useCallback(() => ref.current?.click(), []);

  const inputProps = useMemo(
    () => ({
      ref,
      type: "file" as const,
      accept: accept ? accept.join(",") : "",
      multiple,
      onChange,
      style: { display: "none" },
    }),
    [accept, multiple, onChange]
  );

  return { inputProps, browse };
}
