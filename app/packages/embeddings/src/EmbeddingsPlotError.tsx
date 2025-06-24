import { Loading } from "@fiftyone/components";
import ErrorWithStack from "./ErrorWithStack";
import { PlotError } from "./types";


interface EmbeddingsPlotErrorProps {
  error: PlotError;
}

export default function EmbeddingsPlotError({ error }: EmbeddingsPlotErrorProps) {
  if (error?.stack) {
    return <ErrorWithStack error={error} />
  }
  return <Loading>{error.message}</Loading>;
}
