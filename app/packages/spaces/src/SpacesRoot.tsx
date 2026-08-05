import { Space } from "./components";
import { useSpaces } from "./hooks";
import { SpacesRootProps } from "./types";

export default function SpacesRoot(props: SpacesRootProps) {
  const { id, defaultState } = props;
  const { spaces } = useSpaces(id, defaultState);
  const key = `${id}-${spaces.root.layout}`;
  return <Space node={spaces.root} id={id} key={key} />;
}
