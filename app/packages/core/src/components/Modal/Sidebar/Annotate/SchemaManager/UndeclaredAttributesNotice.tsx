/**
 * Under the schema picker: the attributes the selected schema defines
 * that the dataset's field schema has not declared (so the sidebar and
 * its filters do not show them), with a "Declare" action. Checking reads
 * the field schema only; declaring scans the attributes' values to pick
 * each type, so it only runs when a schema manager asks for it.
 */

import { useRefresh } from "@fiftyone/state";
import {
  Button,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useRef, useState } from "react";
import { type AttributesByPath, useSchemaDocs } from "./useSchemaDocs";

const count = (byPath: AttributesByPath) =>
  Object.values(byPath).reduce((n, names) => n + names.length, 0);

const describe = (byPath: AttributesByPath) =>
  Object.entries(byPath)
    .map(([path, names]) => `${path}: ${names.join(", ")}`)
    .join("; ");

const UndeclaredAttributesNotice = ({
  schemaId,
  contentVersion,
}: {
  /** The selected schema doc, or null for the dataset default. */
  schemaId: string | null;
  /** Changes whenever the schema's content may have changed. */
  contentVersion: unknown;
}) => {
  const api = useSchemaDocs();
  const refresh = useRefresh();
  const [undeclared, setUndeclared] = useState<AttributesByPath>({});
  const [skipped, setSkipped] = useState<AttributesByPath>({});
  const [declaring, setDeclaring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const current = ++seq.current;
    setError(null);
    setSkipped({});
    api
      .listUndeclared(schemaId)
      .then((result) => {
        if (seq.current === current) setUndeclared(result);
      })
      .catch(() => {
        // The check is advisory: without it the notice stays hidden
        if (seq.current === current) setUndeclared({});
      });
  }, [api, schemaId, contentVersion]);

  const declare = () => {
    const current = ++seq.current;
    setDeclaring(true);
    setError(null);
    api
      .declareAttributes(schemaId)
      .then(({ declared, skipped: notDeclared }) => {
        if (seq.current !== current) return;
        setUndeclared(notDeclared);
        setSkipped(notDeclared);
        if (declared.length) refresh();
      })
      .catch((err) => {
        if (seq.current === current) setError(String(err));
      })
      .finally(() => {
        if (seq.current === current) setDeclaring(false);
      });
  };

  const pending = count(undeclared);
  const unresolvable = count(skipped);
  if (!pending && !error) return null;

  return (
    <div
      data-cy="undeclared-attributes"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <Text
        variant={TextVariant.Sm}
        color={error ? TextColor.Failure : TextColor.Secondary}
      >
        {error
          ? `Failed to declare attributes: ${error}`
          : unresolvable
            ? `${unresolvable} attribute${unresolvable === 1 ? "" : "s"} could not be declared because ${unresolvable === 1 ? "its values have" : "their values have"} mixed types: ${describe(skipped)}`
            : `${pending} attribute${pending === 1 ? " isn't" : "s aren't"} declared on the dataset, so the sidebar and its filters don't show ${pending === 1 ? "it" : "them"} (${describe(undeclared)}).`}
      </Text>
      {pending && !unresolvable ? (
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          disabled={declaring}
          onClick={declare}
          data-cy="declare-attributes"
        >
          {declaring ? <Spinner size={Size.Sm} /> : "Declare"}
        </Button>
      ) : null}
    </div>
  );
};

export default UndeclaredAttributesNotice;
