import { useRecoilValueLoadable } from "recoil";
import { lightningUnlocked } from "../recoil";

export default function () {
  const loadable = useRecoilValueLoadable(lightningUnlocked);

  if (loadable.state === "hasError") {
    throw loadable.contents;
  }

  if (loadable.state === "loading") {
    return false;
  }

  return loadable.contents;
}
