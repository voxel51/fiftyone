import { executeOperator } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useBrowserStorage } from "@fiftyone/state";
import React, {
  type MutableRefObject,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import Input from "../../Common/Input";
import { Button } from "../../utils";
import Popout from "../Popout";
import {
  INIT_RUN_OPERATOR_URI,
  PANEL_NAME,
  SEARCH_OPERATOR_URI,
} from "./constants";
import GroupButton, { type ButtonDetail } from "./GroupButton";
import Helper from "./Helper";
import { availableSimilarityKeys, getQueryIds, sortType } from "./utils";

const DEFAULT_K = 25;

const LONG_BUTTON_STYLE: React.CSSProperties = {
  margin: "0.5rem 0",
  height: "2rem",
  flex: 1,
  textAlign: "center",
};

interface SimilarityPopoverProps {
  modal: boolean;
  isImageSearch: boolean;
  close: () => void;
  anchorRef?: MutableRefObject<HTMLElement>;
}

const SimilarityPopover = ({
  modal,
  isImageSearch,
  close,
  anchorRef,
}: SimilarityPopoverProps) => {
  const [textQuery, setTextQuery] = useState("");

  const keys = useRecoilValue(
    availableSimilarityKeys({ modal, isImageSearch })
  );
  const hasSimilarityKeys = keys.length > 0;

  const type = useRecoilValue(sortType(modal));
  const datasetId = fos.useAssertedRecoilValue(fos.datasetId);
  const [lastUsedBrainKeys, setLastUsedBrainKeys] =
    useBrowserStorage("lastUsedBrainKeys");

  const resolvedBrainKey = useMemo(() => {
    if (keys.length === 0) return undefined;
    try {
      const stored = lastUsedBrainKeys
        ? JSON.parse(lastUsedBrainKeys)[datasetId]
        : null;
      if (stored && keys.includes(stored)) return stored;
    } catch {
      // parse may fail
    }
    return keys[0];
  }, [keys, lastUsedBrainKeys, datasetId]);

  const resolvePatchesField = useRecoilCallback(
    ({ snapshot }) =>
      async (brainKey: string) => {
        const methods = await snapshot.getPromise(fos.similarityMethods);
        const match = methods.patches.find(
          ([method]) => method.key === brainKey
        );
        return match ? match[1] : undefined;
      },
    []
  );

  const openPanel = useCallback(() => {
    executeOperator("open_panel", {
      name: PANEL_NAME,
      isActive: true,
      layout: "horizontal",
    });
  }, []);

  const handleSearch = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        if (!resolvedBrainKey) return;

        const queryIds = isImageSearch
          ? await getQueryIds(snapshot, resolvedBrainKey)
          : undefined;

        if (isImageSearch && (!queryIds || queryIds.length === 0)) return;
        if (!isImageSearch && !textQuery.trim()) return;

        const pf = await resolvePatchesField(resolvedBrainKey);

        const params: Record<string, unknown> = {
          brain_key: resolvedBrainKey,
          query_type: isImageSearch ? "image" : "text",
          query: isImageSearch ? queryIds : textQuery.trim(),
          reverse: false,
          k: DEFAULT_K,
        };
        if (pf) {
          params.patches_field = pf;
        }

        const current = lastUsedBrainKeys ? JSON.parse(lastUsedBrainKeys) : {};
        setLastUsedBrainKeys(
          JSON.stringify({ ...current, [datasetId]: resolvedBrainKey })
        );

        close();

        executeOperator(SEARCH_OPERATOR_URI, params, {
          callback: (result) => {
            if (result?.delegated) {
              const resultObj = result?.result as
                | { id?: { $oid?: string } }
                | undefined;
              const operatorRunId = resultObj?.id?.$oid;
              executeOperator(
                INIT_RUN_OPERATOR_URI,
                { ...params, operator_run_id: operatorRunId },
                { callback: () => openPanel() }
              );
            } else {
              openPanel();
            }
          },
        });
      },
    [
      resolvedBrainKey,
      isImageSearch,
      textQuery,
      resolvePatchesField,
      close,
      openPanel,
      lastUsedBrainKeys,
      setLastUsedBrainKeys,
      datasetId,
    ]
  );

  const handleOpenPanel = useCallback(() => {
    close();
    openPanel();
  }, [close, openPanel]);

  const groupButtons: ButtonDetail[] = [
    {
      icon: "SettingsIcon",
      ariaLabel: "Open similarity panel",
      tooltipText: "Open similarity panel",
      onClick: handleOpenPanel,
    },
  ];

  if (!isImageSearch) {
    groupButtons.unshift({
      icon: "SearchIcon",
      ariaLabel: "Search",
      tooltipText: "Search by text similarity",
      onClick: handleSearch,
    });
  }

  return (
    <Popout modal={modal} style={{ minWidth: 280 }} fixed anchorRef={anchorRef}>
      {hasSimilarityKeys && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexDirection: "row",
          }}
        >
          {!isImageSearch && (
            <Input
              placeholder={"Type anything!"}
              value={textQuery}
              setter={setTextQuery}
              onEnter={handleSearch}
            />
          )}
          {isImageSearch && (
            <Button
              text={"Show similar samples"}
              title={`Search by similarity to the selected ${type}`}
              onClick={handleSearch}
              style={LONG_BUTTON_STYLE}
            />
          )}
          <GroupButton buttons={groupButtons} />
        </div>
      )}
      {!hasSimilarityKeys && (
        <Helper hasSimilarityKeys={false} isImageSearch={isImageSearch} />
      )}
    </Popout>
  );
};

export default SimilarityPopover;
