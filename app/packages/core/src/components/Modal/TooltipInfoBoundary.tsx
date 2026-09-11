import * as fos from "@fiftyone/state";
import { ComponentType } from "react";
import {
  FallbackProps,
  ErrorBoundary as ReactErrorBoundary,
} from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { TooltipInfo } from "./TooltipInfo";

/**
 * Identity of the overlay a tooltip detail describes. Stable across pointer
 * moves over the same label, so an errored boundary retries only when the
 * user hovers something else.
 */
export const tooltipDetailIdentity = (
  detail: { label?: { _id?: string; id?: string }; field?: string } | null,
) => detail?.label?._id ?? detail?.label?.id ?? detail?.field;

/**
 * Error boundary for the floating tooltip. Subscribes to the tooltip detail
 * here rather than in Modal so hover updates do not rerender the whole modal,
 * and folds the hovered overlay's identity into resetKeys: Modal does not
 * otherwise subscribe to tooltip state, so without this a throw on one label
 * would leave the fallback up until sample navigation.
 */
export const TooltipInfoBoundary = ({
  FallbackComponent,
  onError,
  resetKeys,
}: {
  FallbackComponent: ComponentType<FallbackProps>;
  onError: (error: Error, info: { componentStack: string }) => void;
  resetKeys: unknown[];
}) => {
  const detail = useRecoilValue(fos.tooltipDetail);
  return (
    <ReactErrorBoundary
      FallbackComponent={FallbackComponent}
      onError={onError}
      resetKeys={[...resetKeys, tooltipDetailIdentity(detail)]}
    >
      <TooltipInfo />
    </ReactErrorBoundary>
  );
};
