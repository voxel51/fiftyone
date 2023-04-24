import { useDynamicGroupContext } from "../DynamicGroupContextProvider";

export const NestedGroup = () => {
  const { lookerRefCallback } = useDynamicGroupContext();

  return <div>dynamic</div>;
};
