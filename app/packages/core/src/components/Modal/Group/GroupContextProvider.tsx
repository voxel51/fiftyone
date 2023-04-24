import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React, { useContext, useMemo } from "react";
import { useRecoilValue } from "recoil";

export type GroupContext = {
  lookerRefCallback: (looker: AbstractLooker) => void;
  groupByFieldValue: string | null;
};

const defaultOptions: GroupContext = {
  lookerRefCallback: () => {},
  groupByFieldValue: null,
};

export const groupContext = React.createContext<GroupContext>(defaultOptions);

export const useGroupContext = () => useContext(groupContext);

interface GroupContextProviderProps {
  children: React.ReactNode;
  lookerRefCallback: (looker: AbstractLooker) => void;
}

export const GroupContextProvider = ({
  lookerRefCallback,
  children,
}: GroupContextProviderProps) => {
  const modal = useRecoilValue(fos.modal);
  const dynamicGroupParameters = useRecoilValue(fos.dynamicGroupParameters);

  const groupByFieldValue = useMemo(() => {
    if (modal && dynamicGroupParameters?.groupBy) {
      return modal.sample[
        fos.getSanitizedGroupByExpression(dynamicGroupParameters.groupBy)
      ] as unknown as string;
    }
    return null;
  }, [modal, dynamicGroupParameters]);

  return (
    <groupContext.Provider
      value={{
        lookerRefCallback,
        groupByFieldValue,
      }}
    >
      {children}
    </groupContext.Provider>
  );
};
