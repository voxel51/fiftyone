import { ReactElement } from "react";
import { BaseStylesProvider } from "../styled-components";

export default function OperatorPromptHeader({
  title,
}: {
  title: ReactElement;
}) {
  return <BaseStylesProvider>{title}</BaseStylesProvider>;
}
