import {
  usePromptOperatorInput,
  useFirstExistingUri,
} from "@fiftyone/operators";
import { scrollable } from "@fiftyone/components";
import {
  Button,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { ImageSearchIcon as ImageSearch } from "../../mui";
import {
  BRAIN_COMPUTE_SIMILARITY_URI,
  BRAIN_PLUGIN_URL,
  DOCS_URL,
} from "../../constants";
import {
  NoBrainKeysContainer,
  NoBrainKeysCard,
  NoBrainKeysHeader,
  NoBrainKeysIconBox,
  NoBrainKeysHeaderText,
  NoBrainKeysSection,
  NoBrainKeysCta,
  NoBrainKeysActions,
  Divider,
  codeBlockStyle,
} from "../styled";

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
    <NoBrainKeysContainer>
      <NoBrainKeysCard>
        <NoBrainKeysHeader>
          <NoBrainKeysIconBox>
            <ImageSearch
              style={{
                fontSize: 24,
                color: "var(--fo-palette-primary-main)",
              }}
            />
          </NoBrainKeysIconBox>
          <NoBrainKeysHeaderText>
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
          </NoBrainKeysHeaderText>
        </NoBrainKeysHeader>

        <Divider />

        {hasBrainOperator ? (
          <NoBrainKeysCta>
            <ComputeSimilarityButton />
            <Text variant={TextVariant.Md} color={TextColor.Muted}>
              or create an index via{" "}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                Python SDK
              </a>
            </Text>
          </NoBrainKeysCta>
        ) : (
          <>
            <NoBrainKeysSection>
              <Text
                variant={TextVariant.Md}
                color={TextColor.Muted}
                style={{ marginBottom: 6 }}
              >
                Install via CLI:
              </Text>
              <pre className={scrollable} style={codeBlockStyle}>
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
            </NoBrainKeysSection>

            <Divider />

            <NoBrainKeysSection>
              <Text
                variant={TextVariant.Md}
                color={TextColor.Muted}
                style={{ marginBottom: 6 }}
              >
                Or create an index via Python:
              </Text>
              <pre className={scrollable} style={codeBlockStyle}>
                {`import fiftyone.brain as fob

results = fob.compute_similarity(
    dataset,
    model="clip-vit-base32-torch",
    brain_key="clip_sim",
)`}
              </pre>
            </NoBrainKeysSection>

            <Divider />

            <NoBrainKeysActions>
              <Button
                variant={Variant.Secondary}
                size={Size.Sm}
                onClick={() => window.open(DOCS_URL, "_blank")}
                trailingIcon={IconName.ExternalLink}
              >
                View Docs
              </Button>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                onClick={() => window.open(BRAIN_PLUGIN_URL, "_blank")}
                trailingIcon={IconName.ExternalLink}
              >
                Brain Plugin
              </Button>
            </NoBrainKeysActions>
          </>
        )}
      </NoBrainKeysCard>
    </NoBrainKeysContainer>
  );
}
