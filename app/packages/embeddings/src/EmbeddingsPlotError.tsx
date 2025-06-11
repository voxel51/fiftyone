import { Loading } from "@fiftyone/components";
import ErrorWithStack from "./ErrorWithStack";

export default function EmbeddingsPlotError({ error }) {
  if (error?.stack) {
    return <ErrorWithStack error={error} />
  }
  return <Loading>{error.message}</Loading>;
}
