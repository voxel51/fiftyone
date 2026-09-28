/**
 * The panel's landing view: one card per visualization run on the
 * dataset. Every run is listed and viewable regardless of its
 * dimensionality — the plot renders with whatever camera the build
 * provides. Deleting a run is a two-step confirmation handled inline
 * on the card.
 */
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
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
import { LandingCTA } from "./LandingCTA";
import "./panel.css";
import type { VisualizationRun } from "./protocol";
import { RunCard } from "./RunCard";
import { UpsellBanner } from "./UpsellBanner";

// MM/DD/YYYY per the card spec — a fixed format, not the viewer locale
const formatTimestamp = (timestamp: string | null): string | null => {
  if (!timestamp) return null;
  // A run's timestamp crosses GraphQL as epoch MILLISECONDS (the server's
  // DateTime scalar), which `new Date(string)` parses as Invalid Date
  const epochMs = Number(timestamp);
  const date = new Date(Number.isFinite(epochMs) ? epochMs : timestamp);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
};

/** "clip-vit-base32-torch (UMAP)", or the precomputed fallback. */
const embeddingsSource = (run: VisualizationRun): string => {
  const source = run.model || "pre-computed embeddings";
  return run.method ? `${source} (${run.method.toUpperCase()})` : source;
};

/** What one point on this run's plot is: "gt patches" or "samples". */
const covers = (run: VisualizationRun): string =>
  run.patchesField ? `${run.patchesField} patches` : "samples";

const lastUpdated = (timestamp: string | null): string | null => {
  const formatted = formatTimestamp(timestamp);
  return formatted ? `last updated ${formatted}` : null;
};

export default function RunsList({
  runs,
  actionError = null,
  showUpsell = true,
  onCreate,
  onOpen,
  onDelete,
}: {
  runs: VisualizationRun[] | null;
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

  // A refreshed run list can delete a run or flip its readiness under an
  // open menu or an armed confirmation; both must not outlive the ready
  // card they belong to (a recreated same-name run must not inherit them)
  useEffect(() => {
    const isActionable = (key: string | null) =>
      Boolean(
        key && runs?.some((r) => r.brainKey === key && (r.ready || r.error)),
      );
    if (menu && !isActionable(menu.key)) setMenu(null);
    if (confirmKey && !isActionable(confirmKey)) setConfirmKey(null);
  }, [runs, menu, confirmKey]);

  const runActions = (run: VisualizationRun) => {
    // No actions on pending runs: Refresh needs results, and Delete
    // would remove the run record without stopping the computation
    // writing it (manage those from the Runs page). An ERRORED run is
    // not pending — Delete is its recovery path
    if (!run.ready && !run.error) return undefined;
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
      <Button
        aria-label="Run actions"
        leadingIcon={IconName.MoreHorizontal}
        onClick={(event) =>
          setMenu({
            key: run.brainKey,
            anchor: event.currentTarget,
          })
        }
        size={Size.Sm}
        variant={Variant.Icon}
      />
    );
  };

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
        {/* The 3D banner earns its slot only once a first run exists
            (FOEPD-4401) — before that, the landing CTA below is the
            single upsell surface */}
        {showUpsell && !dismissed && runs.length > 0 && (
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
          showUpsell ? (
            // Builds that can't compute in-app show the enterprise
            // landing instead of a dead-end empty state (FOEPD-4369)
            <LandingCTA />
          ) : (
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
          )
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
                  run.error
                    ? // Structurally unusable (see BrainRun.error): opening
                      // it could only fail, but Delete stays available
                      { label: "Error", color: TextColor.Destructive }
                    : run.ready
                      ? // Icon-tier success: the soft sage the design
                        // reference uses, not the saturated text green
                        { label: "Ready", color: IconColor.Success }
                      : // Deliberately status-agnostic: without run-status
                        // bookkeeping, "no results yet" cannot distinguish
                        // still-computing from failed
                        { label: "Pending", color: TextColor.Secondary }
                }
                // One shape for every run: what it covers, what produced it,
                // when it last changed
                meta={[
                  run.error,
                  // Same brain key semantics, very different plots —
                  // which granularity a run embeds must be readable
                  // from the card
                  covers(run),
                  embeddingsSource(run),
                  lastUpdated(run.timestamp),
                ].filter((item): item is string => Boolean(item))}
                onClick={
                  run.ready && !run.error
                    ? () => onOpen(run.brainKey)
                    : undefined
                }
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
