import { useState } from "react";
import { atom, useRecoilState } from "recoil";

const jsonPanelSample = atom({
  key: "jsonPanelSample",
  default: null,
});

export default function useJSONPanel() {
  const [isOpen, setOpen] = useState(false);
  const [isOpen, setOpen] = useState(false);

  return {
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    isOpen,
    setSample,
  };
}
