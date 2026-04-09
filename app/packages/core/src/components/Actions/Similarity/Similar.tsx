import { PopoutSectionTitle } from "@fiftyone/components";
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
import { PANEL_NAME, SEARCH_OPERATOR_URI } from "./constants";
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
  const hasSelectedLabels = useRecoilValue(fos.hasSelectedLabels);
  const selectedLabelsList = useRecoilValue(fos.selectedLabels);

  // Detect if selected labels span multiple fields
  const selectedLabelFields = useMemo(() => {
    if (!modal || !hasSelectedLabels) return new Set<string>();
    return new Set(selectedLabelsList.map((l) => l.field));
  }, [modal, hasSelectedLabels, selectedLabelsList]);

  const hasMixedFields = selectedLabelFields.size > 1;
  const showMixedFieldWarning = modal && isImageSearch && hasMixedFields;
  const showNoIndexWarning =
    modal && isImageSearch && !hasMixedFields && !hasSimilarityKeys;

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
    ({ snapshot, set }) =>
      async () => {
        if (!resolvedBrainKey) return;

        const queryIds = isImageSearch
          ? await getQueryIds(snapshot, resolvedBrainKey)
          : undefined;

        if (isImageSearch && (!queryIds || queryIds.length === 0)) return;
        if (!isImageSearch && !textQuery.trim()) return;

        const patchesField = await resolvePatchesField(resolvedBrainKey);

        const params: Record<string, unknown> = {
          brain_key: resolvedBrainKey,
          query_type: isImageSearch ? "image" : "text",
          query: isImageSearch ? queryIds : textQuery.trim(),
          reverse: false,
          k: DEFAULT_K,
        };
        if (patchesField) {
          params.patches_field = patchesField;
        }

        const current = lastUsedBrainKeys ? JSON.parse(lastUsedBrainKeys) : {};
        setLastUsedBrainKeys(
          JSON.stringify({ ...current, [datasetId]: resolvedBrainKey })
        );

        close();

        executeOperator(SEARCH_OPERATOR_URI, params, {
          callback: () => {
            if (modal) {
              set(fos.modalSelector, null);
            }
            executeOperator("clear_selected_samples");
            executeOperator("clear_selected_labels");
            set(fos.extendedSelection, { selection: [] });

            if (patchesField) {
              // Patches search completed: switch to patches view,
              // then open panel
              executeOperator(
                "set_view",
                {
                  view: [
                    {
                      _cls: "fiftyone.core.stages.ToPatches",
                      kwargs: [["field", patchesField]],
                    },
                  ],
                },
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
      modal,
      lastUsedBrainKeys,
      setLastUsedBrainKeys,
      datasetId,
    ]
  );

  const handleOpenPanel = useRecoilCallback(
    ({ set }) =>
      () => {
        close();
        if (modal) {
          set(fos.modalSelector, null);
        }
        openPanel();
      },
    [close, modal, openPanel]
  );

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
      {showMixedFieldWarning && (
        <PopoutSectionTitle style={{ fontSize: 12 }}>
          Selected labels must be from the same field to search by similarity
        </PopoutSectionTitle>
      )}
      {showNoIndexWarning && (
        <PopoutSectionTitle style={{ fontSize: 12 }}>
          No similarity index found for the selected label field
        </PopoutSectionTitle>
      )}
      {!showMixedFieldWarning && !showNoIndexWarning && hasSimilarityKeys && (
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
              text={modal ? "Show similar patches" : "Show similar samples"}
              title={`Search by similarity to the selected ${type}`}
              onClick={handleSearch}
              style={LONG_BUTTON_STYLE}
            />
          )}
          <GroupButton buttons={groupButtons} />
        </div>
      )}
      {!showMixedFieldWarning && !showNoIndexWarning && !hasSimilarityKeys && (
        <Helper hasSimilarityKeys={false} isImageSearch={isImageSearch} />
      )}
    </Popout>
  );
};

export default SimilarityPopover;
