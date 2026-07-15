import { AgentDescriptor } from "./registry";
import { FormField, Select } from "@voxel51/voodo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentSelector } from "./hooks";
import { InferenceResultProxy } from "./types";

/**
 * Dropdown for selecting an annotation agent from the registry.
 *
 * @param value Currently selected agent descriptor.
 * @param onChange Called when the user picks a different agent.
 */
export const AgentSelect = ({
  value,
  onChange,
}: {
  value?: AgentDescriptor<InferenceResultProxy> | null;
  onChange?: (agent: AgentDescriptor<InferenceResultProxy> | null) => void;
}) => {
  const [agent, setAgent] =
    useState<AgentDescriptor<InferenceResultProxy> | null>(value);
  const agentSelector = useAgentSelector();

  useEffect(() => {
    setAgent(value ?? null);
  }, [value]);

  const selectOptions = useMemo(
    () =>
      agentSelector.agents?.map((descriptor) => ({
        id: descriptor.id,
        data: {
          label: descriptor.label,
        },
      })) ?? [],
    [agentSelector.agents],
  );

  const handleChange = useCallback(
    (value: string | null) => {
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
