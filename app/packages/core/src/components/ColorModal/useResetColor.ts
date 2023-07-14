import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { resetColor } from "./ColorFooter";

type UseResetColorReturnType = [string, Dispatch<SetStateAction<string>>];

export function useResetColor(initialColor: string): UseResetColorReturnType {
  const [color, setColor] = useState(initialColor);
  const resetCounter = useRecoilValue(resetColor);

  useEffect(() => {
    setColor(initialColor);
  }, [resetCounter, initialColor]);

  return [color, setColor];
}
