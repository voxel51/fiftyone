import { ReactElement } from "react";
import { BaseStylesProvider } from "../styled-components";

export default function OperatorPromptHeader({
  title,
  id,
}: {
  title: ReactElement;
  id?: string;
}) {
  return <BaseStylesProvider id={id}>{title}</BaseStylesProvider>;
}
