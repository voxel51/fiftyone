import { AgentDescriptor, isAgentSelectable } from "./registry";
import { ENTERPRISE_LEARN_MORE_URL } from "@fiftyone/components";
import {
  Align,
  FormField,
  Icon,
  IconName,
  Justify,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentSelector } from "./hooks";
import { InferenceResultProxy } from "./types";

/** Sentinel option id for the non-selectable Enterprise upsell row. */
const ENTERPRISE_UPSELL_ID = "enterprise:sam2-large";

/**
 * A muted, link-out row for a model only available in FiftyOne Enterprise.
 * voodo's `Select` has no per-option disabled state, so the "disabled" look is
 * styling only; the click is intercepted in `handleChange` (opens the upgrade
 * page, leaves the selection unchanged) rather than selecting the row.
 */
const enterpriseUpsellOption = (label: string) => ({
  id: ENTERPRISE_UPSELL_ID,
  data: {
    label,
    content: (
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        justify={Justify.Between}
        spacing={Spacing.Sm}
      >
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          {label}
        </Text>
        <Icon
          name={IconName.ExternalLink}
          size={Size.Sm}
          color={TextColor.Secondary}
        />
      </Stack>
    ),
  },
});

/**
 * Dropdown for selecting an annotation agent from the registry.
 *
 * @param value Currently selected agent descriptor.
 * @param onChange Called when the user picks a different agent.
 * @param showEnterpriseUpsell Appends a non-selectable "Enterprise only" row
 *  that links out to the upgrade page. Off by default.
 */
export const AgentSelect = ({
  value,
  onChange,
  showEnterpriseUpsell = false,
}: {
  value?: AgentDescriptor<InferenceResultProxy> | null;
  onChange?: (agent: AgentDescriptor<InferenceResultProxy> | null) => void;
  showEnterpriseUpsell?: boolean;
}) => {
  const [agent, setAgent] =
    useState<AgentDescriptor<InferenceResultProxy> | null>(value);
  const agentSelector = useAgentSelector();

  useEffect(() => {
    setAgent(value ?? null);
  }, [value]);

  // Only agents the user may pick: excludes the unavailable (a service-backed
  // agent whose service isn't running) and the unlisted (resolved
  // programmatically, never surfaced). voodo's Select has no per-option
  // disabled, so an excluded agent is dropped entirely.
  const selectableAgents = useMemo(
    () => agentSelector.agents?.filter(isAgentSelectable) ?? [],
    [agentSelector.agents],
  );

  // If the selected agent drops out of the selectable list, clear the stale
  // selection and notify the parent so Select never holds a value that isn't
  // an option. Gate on `isResolved` so a preselected agent isn't wiped on the
  // first render before the registry has loaded.
  useEffect(() => {
    if (
      agentSelector.isResolved &&
      agent &&
      !selectableAgents.some((d) => d.id === agent.id)
    ) {
      setAgent(null);
      onChange?.(null);
    }
  }, [agentSelector.isResolved, agent, selectableAgents, onChange]);

  // The registry's real agents, plus (when opted in) a trailing
  // Enterprise-only upsell row.
  const selectOptions = useMemo(
    () => [
      ...selectableAgents.map((descriptor) => ({
        id: descriptor.id,
        data: {
          label: descriptor.label,
        },
      })),
      ...(showEnterpriseUpsell
        ? [enterpriseUpsellOption("SAM2 Large (FiftyOne Enterprise Only)")]
        : []),
    ],
    [selectableAgents, showEnterpriseUpsell],
  );

  const handleChange = useCallback(
    (value: string | null) => {
      // The upsell row isn't a real option; open the upgrade page and leave
      // the current selection intact.
      if (value === ENTERPRISE_UPSELL_ID) {
        window.open(ENTERPRISE_LEARN_MORE_URL, "_blank", "noopener,noreferrer");
        return;
      }

      const selected = value
        ? (agentSelector.agents?.find((e) => e.id === value) ?? null)
        : null;

      setAgent(selected);
      onChange?.(selected);
    },
    [agentSelector.agents, onChange],
  );

  return (
    <FormField
      label="Select annotation model"
      control={
        <Select
          disabled={!agentSelector.isResolved}
          exclusive
          onChange={handleChange}
          options={selectOptions}
          value={agent?.id ?? null}
          portal
        />
      }
    />
  );
};
