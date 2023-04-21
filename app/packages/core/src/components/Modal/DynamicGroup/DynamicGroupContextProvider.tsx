import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React, { useContext, useMemo } from "react";
import { useRecoilValue } from "recoil";

export type DynamicGroupContext = {
  lookerRefCallback: (looker: AbstractLooker) => void;
  dynamicGroupParameters: fos.State.DynamicGroupParameters;
  groupByFieldValue: string | null;
};

const defaultOptions: DynamicGroupContext = {
  lookerRefCallback: () => {},
  dynamicGroupParameters: { orderBy: "", groupBy: "" },
  groupByFieldValue: null,
};

export const dynamicGroupContext =
  React.createContext<DynamicGroupContext>(defaultOptions);

export const useDynamicGroupContext = () => useContext(dynamicGroupContext);

interface DynamicGroupContextProviderProps {
  children: React.ReactNode;
  lookerRefCallback: (looker: AbstractLooker) => void;
  dynamicGroupParameters: fos.State.DynamicGroupParameters;
}

export const DynamicGroupContextProvider = ({
  lookerRefCallback,
  children,
  dynamicGroupParameters,
}: DynamicGroupContextProviderProps) => {
  const modal = useRecoilValue(fos.modal);

  const groupByFieldValue = useMemo(() => {
    if (modal && dynamicGroupParameters?.groupBy) {
      console.log("setting group value");
      return modal.sample[
        fos.getSanitizedGroupByExpression(dynamicGroupParameters.groupBy)
      ] as unknown as string;
    }
    return null;
  }, [modal, dynamicGroupParameters]);

  return (
    <dynamicGroupContext.Provider
      value={{
        lookerRefCallback,
        dynamicGroupParameters,
        groupByFieldValue,
      }}
    >
      {children}
    </dynamicGroupContext.Provider>
  );
};
