/**
 * The panel's landing view: one card per visualization run on the
 * dataset. Every run is listed and viewable regardless of its
 * dimensionality — the plot renders with whatever camera the build
 * provides. Deleting a run is a two-step confirmation handled inline
 * on the card.
 */
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  BackgroundColor,
  Button,
  EmptyState,
  getColorCssVar,
  IconColor,
  IconName,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useState } from "react";
import "./panel.css";
import type { VisualizationRun } from "./protocol";
import { RunCard } from "./RunCard";
import { UpsellBanner } from "./UpsellBanner";

const formatTimestamp = (timestamp: string | null): string | null => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
};

export default function RunsList({
  runs,
  error,
  actionError = null,
  showUpsell = true,
  onCreate,
  onOpen,
  onDelete,
}: {
  runs: VisualizationRun[] | null;
  error: string | null;
  /** A failed mutation (e.g. delete); shown without replacing the list */
  actionError?: string | null;
  /** Advertise capabilities this build lacks; off where they exist */
  showUpsell?: boolean;
  /**
   * Launches the compute-visualization flow. Only builds that can
   * compute (operator present, user permitted) pass this; without it
   * no create affordance renders.
   */
  onCreate?: () => void;
  onOpen: (brainKey: string) => void;
  onDelete: (brainKey: string) => void;
}) {
  // Banner dismissal lasts for the session only
  const [dismissed, setDismissed] = useState(false);
  // Delete confirmation: the kebab arms one card, whose inline
  // buttons then confirm or cancel
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  // At most one kebab menu is open; the anchor pairs with its run
  const [menu, setMenu] = useState<{
    key: string;
    anchor: HTMLElement;
  } | null>(null);

  // Polling can delete a run or flip its readiness under an open menu or
  // an armed confirmation; both must not outlive the ready card they
  // belong to (a recreated same-name run must not inherit them)
  useEffect(() => {
    const isReady = (key: string | null) =>
      Boolean(key && runs?.some((r) => r.brainKey === key && r.ready));
    if (menu && !isReady(menu.key)) setMenu(null);
    if (confirmKey && !isReady(confirmKey)) setConfirmKey(null);
  }, [runs, menu, confirmKey]);

  const runActions = (run: VisualizationRun) => {
    // No actions on pending runs: Refresh needs results, and Delete
    // would remove the run record without stopping the computation
    // writing it (manage those from the Runs page)
    if (!run.ready) return undefined;
    if (confirmKey === run.brainKey) {
      return (
        <>
          <Button
            variant={Variant.Secondary}
            size={Size.Xs}
            onClick={() => setConfirmKey(null)}
          >
            Cancel
          </Button>
          <Button
            variant={Variant.Danger}
            size={Size.Xs}
            onClick={() => {
              setConfirmKey(null);
              onDelete(run.brainKey);
            }}
          >
            Delete run
          </Button>
        </>
      );
    }
    return (
      <IconButton
        size="small"
        aria-label="Run actions"
        onClick={(event) =>
          setMenu({
            key: run.brainKey,
            anchor: event.currentTarget,
          })
        }
      >
        <MoreHoriz fontSize="small" />
      </IconButton>
    );
  };

  if (error) {
    return (
      <div className="emb-runs-page">
        <div className="emb-runs-center">
          <Text variant={TextVariant.Md} color={TextColor.Destructive}>
            {error}
          </Text>
        </div>
      </div>
    );
  }

  if (!runs) {
    return (
      <div className="emb-runs-page">
        <div className="emb-runs-center">
          <Spinner size={Size.Md} />
        </div>
      </div>
    );
  }

  return (
    <div className="emb-runs-page" data-cy="embeddings-runs-page">
      {runs.length > 0 && (
        <div className="emb-runs-header">
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            {runs.length} visualization{runs.length === 1 ? "" : "s"}
          </Text>
          {onCreate && (
            <Button
              size={Size.Sm}
              leadingIcon={IconName.Add}
              onClick={onCreate}
            >
              New visualization
            </Button>
          )}
        </div>
      )}
      <div className="emb-runs-scroll">
        {showUpsell && !dismissed && (
          <UpsellBanner onDismiss={() => setDismissed(true)} />
        )}
        {actionError && (
          <div className="emb-runs-action-error">
            <Text variant={TextVariant.Md} color={TextColor.Destructive}>
              {actionError}
            </Text>
          </div>
        )}
        {runs.length === 0 ? (
          <div className="emb-runs-center emb-runs-overlay">
            <EmptyState
              icon={IconName.Embeddings}
              title="Visualize your embeddings"
              description="Compute a visualization to explore your dataset in a low-dimensional embedding space."
            />
            {onCreate ? (
              <Button
                size={Size.Sm}
                leadingIcon={IconName.Add}
                onClick={onCreate}
              >
                New visualization
              </Button>
            ) : (
              <Text variant={TextVariant.Sm} color={TextColor.Muted}>
                <code>
                  {'fob.compute_visualization(dataset, brain_key="viz")'}
                </code>
              </Text>
            )}
          </div>
        ) : (
          <div className="emb-runs-stack">
            {runs.map((run) => (
              <RunCard
                key={run.brainKey}
                icon={IconName.Embeddings}
                title={run.brainKey}
                badge={run.dims ? `${run.dims}D` : undefined}
                badgeAccent={run.dims === 3}
                status={
                  run.ready
                    ? // Icon-tier success: the soft sage the design
                      // reference uses, not the saturated text green
                      { label: "Ready", color: IconColor.Success }
                    : // Deliberately status-agnostic: without run-status
                      // bookkeeping, "no results yet" cannot distinguish
                      // still-computing from failed
                      { label: "Pending", color: TextColor.Secondary }
                }
                meta={[
                  run.method,
                  // Same brain key semantics, very different plots —
                  // which granularity a run embeds must be readable
                  // from the card
                  run.patchesField ? `${run.patchesField} patches` : "samples",
                  run.model,
                  formatTimestamp(run.timestamp),
                ].filter((item): item is string => Boolean(item))}
                onClick={run.ready ? () => onOpen(run.brainKey) : undefined}
                actions={runActions(run)}
              />
            ))}
          </div>
        )}
        <Menu
          anchorEl={menu?.anchor ?? null}
          open={Boolean(menu)}
          onClose={() => setMenu(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          sx={{
            zIndex: 9999,
            "& .MuiPaper-root": {
              backgroundColor: `var(${getColorCssVar(BackgroundColor.Muted)})`,
              // Kill MUI's elevation overlay so the grey matches exactly.
              backgroundImage: "none",
            },
          }}
        >
          <MenuItem
            onClick={() => {
              if (menu) setConfirmKey(menu.key);
              setMenu(null);
            }}
            sx={{
              color: `var(${getColorCssVar(TextColor.Destructive)})`,
              "& .MuiListItemIcon-root, & .MuiListItemText-primary": {
                color: "inherit",
              },
            }}
          >
            <ListItemIcon>
              <DeleteOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}
