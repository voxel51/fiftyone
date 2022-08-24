import { useState } from "react";
import { atom, useRecoilState } from "recoil";

const jsonPanelSample = atom({
  key: "jsonPanelSample",
  default: null,
});

export default function useJSONPanel() {
  const [isOpen, setOpen] = useState(false);
  const [sample, setSample] = useRecoilState(null);

  return {
    open(sample) {
      setOpen(true);
      setSample(sample);
    },
    close() {
      setOpen(false);
      setSample(null);
    },
    isOpen,
  };
}
