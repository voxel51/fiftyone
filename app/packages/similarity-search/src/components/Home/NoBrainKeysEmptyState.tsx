import {
  usePromptOperatorInput,
  useFirstExistingUri,
} from "@fiftyone/operators";
import { scrollable } from "@fiftyone/components";
import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import {
  ImageSearchIcon as ImageSearch,
  OpenInNewIcon as OpenInNew,
} from "../../mui";
import {
  BRAIN_COMPUTE_SIMILARITY_URI,
  BRAIN_PLUGIN_URL,
  DOCS_URL,
} from "../../constants";
import * as s from "../styles";

function ComputeSimilarityButton() {
  const promptForInput = usePromptOperatorInput();
  return (
    <Button
      variant={Variant.Primary}
      size={Size.Sm}
      onClick={() => promptForInput(BRAIN_COMPUTE_SIMILARITY_URI)}
    >
      Compute Similarity Index
    </Button>
  );
}

export default function NoBrainKeysEmptyState() {
  const { exists: hasBrainOperator } = useFirstExistingUri([
    BRAIN_COMPUTE_SIMILARITY_URI,
  ]);

  return (
    <div style={s.noBrainKeysContainer}>
      <div style={s.noBrainKeysCard}>
        <div style={s.noBrainKeysHeader}>
          <div style={s.noBrainKeysIconBox}>
            <ImageSearch
              style={{
                fontSize: 24,
                color: "var(--fo-palette-primary-main)",
              }}
            />
          </div>
          <div style={s.noBrainKeysHeaderText}>
            <Text
              variant={TextVariant.Md}
              color={TextColor.Primary}
              style={{ fontWeight: 600 }}
            >
              No similarity index found
            </Text>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              {hasBrainOperator
                ? "Create an index to search for similar samples by image or text."
                : "Install the Brain plugin or compute the similarity index via Python SDK."}
            </Text>
          </div>
        </div>

        <div style={s.divider} />

        {hasBrainOperator ? (
          <div style={s.noBrainKeysCta}>
            <ComputeSimilarityButton />
            <Text variant={TextVariant.Md} color={TextColor.Muted}>
              or create an index via{" "}
              <span
                style={{ textDecoration: "underline", cursor: "pointer" }}
                onClick={() => window.open(DOCS_URL, "_blank")}
              >
                Python SDK
              </span>
            </Text>
          </div>
        ) : (
          <>
            <div style={s.noBrainKeysSection}>
              <Text
                variant={TextVariant.Md}
                color={TextColor.Muted}
                style={{ marginBottom: 6 }}
              >
                Install via CLI:
              </Text>
              <pre className={scrollable} style={s.codeBlock}>
                {`fiftyone plugins download \\
    https://github.com/voxel51/fiftyone-plugins \\
    --plugin-names @voxel51/brain`}
              </pre>
              <Text
                variant={TextVariant.Md}
                color={TextColor.Muted}
                style={{ marginTop: 10 }}
              >
                Enterprise: ask your admin to install via Settings &gt; Plugins.
              </Text>
            </div>

            <div style={s.divider} />

            <div style={s.noBrainKeysSection}>
              <Text
                variant={TextVariant.Md}
                color={TextColor.Muted}
                style={{ marginBottom: 6 }}
              >
                Or create an index via Python:
              </Text>
              <pre className={scrollable} style={s.codeBlock}>
                {`import fiftyone.brain as fob

results = fob.compute_similarity(
    dataset,
    model="clip-vit-base32-torch",
    brain_key="clip_sim",
)`}
              </pre>
            </div>

            <div style={s.divider} />

            <div style={s.noBrainKeysActions}>
              <Button
                variant={Variant.Secondary}
                size={Size.Sm}
                onClick={() => window.open(DOCS_URL, "_blank")}
                trailingIcon={() => <OpenInNew style={{ fontSize: 14 }} />}
              >
                View Docs
              </Button>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                onClick={() => window.open(BRAIN_PLUGIN_URL, "_blank")}
                trailingIcon={() => <OpenInNew style={{ fontSize: 14 }} />}
              >
                Brain Plugin
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
