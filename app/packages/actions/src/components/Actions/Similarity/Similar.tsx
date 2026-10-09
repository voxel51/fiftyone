import { executeOperator } from "@fiftyone/operators";
import {
  Button,
  IconAction,
  Input,
  SearchStrokeIcon,
  Settings2Icon,
  Size,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { PanelItem, PanelList, PanelNote } from "../Panel";
import Popout from "../Popout";
import { PANEL_NAME } from "./constants";
import styles from "./Similar.module.css";
import useSimilarityPopover from "./useSimilarityPopover";

interface SimilarityPopoverProps {
  modal: boolean;
  isImageSearch: boolean;
  close: () => void;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
}

const openIndexes = () =>
  executeOperator("open_panel", {
    name: PANEL_NAME,
    isActive: true,
    layout: "horizontal",
    data: { view: { page: "similarity_index" } },
  });

const PanelAction = ({
  icon,
  label,
  onClick,
}: {
  icon: typeof SearchStrokeIcon;
  label: string;
  onClick: () => void;
}) => (
  <Tooltip anchor="top" content={label} portal>
    <IconAction
      aria-label={label}
      icon={icon}
      size={Size.Sm}
      onClick={onClick}
    />
  </Tooltip>
);

const SimilarityPopover = ({
  modal,
  isImageSearch,
  close,
  onSearchStart,
  onSearchEnd,
}: SimilarityPopoverProps) => {
  const {
    textQuery,
    setTextQuery,
    type,
    hasSimilarityKeys,
    showMixedFieldWarning,
    showNoIndexWarning,
    noIndexWarningText,
    searchButtonText,
    handleSearch,
    handleOpenPanel,
  } = useSimilarityPopover({
    modal,
    isImageSearch,
    close,
    onSearchStart,
    onSearchEnd,
  });

  const warning = showMixedFieldWarning
    ? "Selected labels must be from the same field to search by similarity"
    : showNoIndexWarning
      ? noIndexWarningText
      : null;

  return (
    <Popout modal={modal} style={{ minWidth: 280 }}>
      {warning && <PanelNote>{warning}</PanelNote>}
      {!warning && hasSimilarityKeys && (
        <div className={styles.search}>
          {isImageSearch ? (
            <Button
              className={styles.grow}
              size={Size.Sm}
              title={`Search by similarity to the selected ${type}`}
              variant={Variant.Primary}
              onClick={handleSearch}
            >
              {searchButtonText}
            </Button>
          ) : (
            <>
              <Input
                className={styles.grow}
                placeholder="Type anything!"
                size={Size.Sm}
                value={textQuery}
                onChange={(event) => setTextQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
              />
              <PanelAction
                icon={SearchStrokeIcon}
                label="Search by text similarity"
                onClick={handleSearch}
              />
            </>
          )}
          <PanelAction
            icon={Settings2Icon}
            label="Open similarity panel"
            onClick={handleOpenPanel}
          />
        </div>
      )}
      {!warning && !hasSimilarityKeys && (
        <>
          <PanelNote>
            {isImageSearch
              ? "No available brain keys"
              : "No brain keys support text prompts"}
          </PanelNote>
          <PanelList>
            <PanelItem
              text="Manage similarity indexes"
              title="Open similarity panel to manage indexes"
              onClick={openIndexes}
            />
          </PanelList>
        </>
      )}
    </Popout>
  );
};

export default SimilarityPopover;
