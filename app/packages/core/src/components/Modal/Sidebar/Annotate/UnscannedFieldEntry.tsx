/**
 * A row in the Annotate tab's "UNSCANNED FIELDS" group: a field that is
 * explore-only until it is set up. Hovering reveals the same pencil the
 * Explore sidebar shows; clicking runs the same flow as that pencil —
 * scan and save the field's schema, activate it, and focus annotation
 * on it — after which the field moves up into LABELS / PRIMITIVES.
 *
 * The annotation context is already entered here (this IS the Annotate
 * tab), so the row calls the context manager's `activateField`
 * directly: `enterAnnotationMode` — what the Explore pencil uses —
 * short-circuits when the context is already active and would do
 * nothing.
 */

import {
  InitializationStatus,
  useRegisteredAnnotationContextManager,
} from "@fiftyone/annotation";
import { LoadingDots } from "@fiftyone/components";
import { useNotification } from "@fiftyone/state";
import {
  Clickable,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
} from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useState } from "react";
import styled from "styled-components";
import { fieldType } from "./state";

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-radius: var(--radius-xs);
  background: ${({ theme }) => theme.neutral.softBg};
  padding: 0.5rem;
  min-width: 0;

  .scan-action {
    opacity: 0;
    transition: opacity 0.15s;
  }
  &:hover {
    background: ${({ theme }) => theme.background.level1};
  }
  &:hover .scan-action {
    opacity: 1;
  }
`;

const Name = styled.div`
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const UnscannedFieldEntry = ({ path }: { path: string }) => {
  const type = useAtomValue(fieldType(path));
  const contextManager = useRegisteredAnnotationContextManager();
  const notify = useNotification();
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    if (scanning) return;
    if (!contextManager) {
      notify({ msg: "Annotation is not ready yet", variant: "error" });
      return;
    }
    setScanning(true);
    try {
      const result = await contextManager.activateField(path);
      if (result.status !== InitializationStatus.Success) {
        notify({
          msg:
            result.status === InitializationStatus.InsufficientPermissions
              ? `You don't have permission to set up ${path}`
              : `Failed to set up ${path}${
                  result.message ? `: ${result.message}` : ""
                }`,
          variant: "error",
        });
      }
    } catch (err) {
      notify({ msg: `Failed to set up ${path}: ${err}`, variant: "error" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Row data-cy={`unscanned-field-${path}`} title={path}>
      <Name>{path}</Name>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {type ? <Text color={TextColor.Secondary}>{String(type)}</Text> : null}
        {scanning ? (
          <LoadingDots />
        ) : (
          <span className="scan-action">
            <Clickable
              data-cy={`scan-field-${path}`}
              title="Scan and set up this field for annotation"
              onClick={scan}
            >
              <Icon name={IconName.Edit} size={Size.Sm} />
            </Clickable>
          </span>
        )}
      </span>
    </Row>
  );
};

export default UnscannedFieldEntry;
