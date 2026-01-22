import React from "react";
import RJSF from "./RJSF";
import { SmartFormProps } from "./types";

export type { SmartFormProps };

export default function SmartForm(props: SmartFormProps) {
  // potentially support RJSF alternatives here
  return <RJSF {...props} />;
}
