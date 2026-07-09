/**
 * The panel's landing view: one card per visualization run on the
 * dataset. Runs with 3D points are listed too and open in the 2D plot
 * (the client renders the first two coordinates). Deleting a run is a
 * two-step confirmation handled inline on the card.
 */
import { DeleteOutline, MoreHoriz } from "@mui/icons-material";
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
  IconName,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";
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
  onOpen,
  onDelete,
}: {
  runs: VisualizationRun[] | null;
  error: string | null;
  /** A failed mutation (e.g. delete); shown without replacing the list */
  actionError?: string | null;
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
    <div className="emb-runs-page">
      {runs.length > 0 && (
        <div className="emb-runs-header">
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            {runs.length} visualization{runs.length === 1 ? "" : "s"}
          </Text>
        </div>
      )}
      <div className="emb-runs-scroll">
        {!dismissed && <UpsellBanner onDismiss={() => setDismissed(true)} />}
        {actionError && (
          <div className="emb-runs-action-error">
            <Text variant={TextVariant.Md} color={TextColor.Destructive}>
              {actionError}
            </Text>
          </div>
        )}
        {runs.length === 0 ? (
          <div className="emb-runs-center">
            <EmptyState
              icon={IconName.Embeddings}
              title="Visualize your embeddings"
              description="Compute a visualization to explore your dataset in a low-dimensional embedding space."
            />
            <Text variant={TextVariant.Sm} color={TextColor.Muted}>
              <code>
                {'fob.compute_visualization(dataset, brain_key="viz")'}
              </code>
            </Text>
          </div>
        ) : (
          <div className="emb-runs-stack" style={{ marginTop: "1rem" }}>
            {runs.map((run) => (
              <RunCard
                key={run.brainKey}
                icon={IconName.Embeddings}
                title={run.brainKey}
                badge={run.dims ? `${run.dims}D` : undefined}
                badgeAccent={run.dims === 3}
                status={{ label: "Ready", color: TextColor.Success }}
                meta={[
                  run.method,
                  run.model,
                  formatTimestamp(run.timestamp),
                ].filter((item): item is string => Boolean(item))}
                onClick={() => onOpen(run.brainKey)}
                actions={
                  confirmKey === run.brainKey ? (
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
                  ) : (
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
                  )
                }
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
              <DeleteOutline fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}
