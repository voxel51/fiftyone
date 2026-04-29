import { useAnnotationEventBus } from "@fiftyone/annotation";
import {
  KeypointAnnotationLabel,
  useGetKeypointSkeleton,
} from "@fiftyone/state";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
} from "@mui/material";
import {
  Align,
  Icon,
  IconName,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
} from "@voxel51/voodo";
import { isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import { generatePrimitiveSchema } from "./schemaHelpers";
import { useAnnotationContext } from "./state";
import {
  getKeypointAttributes,
  KeypointAttribute,
  useSelectedKeypointIndex,
  useSelectedKeypointOverlay,
} from "./useSelectedKeypoint";
import { useAnnotationSchemaContext } from "../state";
import { LabelSchemaMeta } from "../useSchemaManager";

/**
 * Schema attribute types are described as they appear on the parent label
 * (e.g. `list<float>` for `confidence`), but the per-point editor renders a
 * single element. Unwraps `list<T>` to `T` so we get the element-level
 * editor (number/bool/str) instead of a list widget.
 */
const unwrapListType = (type: string): string => {
  const match = /^list<(.+)>$/.exec(type);
  return match ? match[1] : type;
};

/**
 * Builds a SchemaIO property descriptor for a single per-point attribute,
 * preferring a matching schema entry and falling back to type inference from
 * the current value when the attribute is dynamic.
 */
const buildAttributeProperty = (
  attribute: KeypointAttribute
): SchemaType | undefined => {
  if (attribute.schema) {
    return generatePrimitiveSchema(attribute.name, {
      ...attribute.schema,
      type: unwrapListType(attribute.schema.type),
      readOnly: attribute.schema.read_only,
    });
  }

  const valueType = typeof attribute.value;
  if (valueType === "string") {
    return generatePrimitiveSchema(attribute.name, { type: "str" });
  }
  if (valueType === "number") {
    return generatePrimitiveSchema(attribute.name, { type: "float" });
  }
  if (valueType === "boolean") {
    return generatePrimitiveSchema(attribute.name, { type: "bool" });
  }

  return undefined;
};

const PerPointEditor = ({
  pointIndex,
  pointCount,
  attributes,
  pointName,
}: {
  pointIndex: number;
  pointCount: number;
  attributes: KeypointAttribute[];
  pointName?: string;
}) => {
  const { selectedLabel } = useAnnotationContext();
  const eventBus = useAnnotationEventBus();

  const schema = useMemo<SchemaType>(() => {
    const properties: Record<string, SchemaType> = {};
    for (const attribute of attributes) {
      const property = buildAttributeProperty(attribute);
      if (property) {
        properties[attribute.name] = property;
      }
    }

    return {
      type: "object",
      view: { component: "ObjectView" },
      properties,
    };
  }, [attributes]);

  const data = useMemo(() => {
    return Object.fromEntries(attributes.map((a) => [a.name, a.value]));
  }, [attributes]);

  const overlay = selectedLabel?.overlay;

  const onChange = useCallback(
    (changes: Record<string, unknown>) => {
      if (!selectedLabel?.data) {
        return;
      }

      const currentLabel =
        selectedLabel.data as KeypointAnnotationLabel["data"];
      let mutated = false;
      const newLabel: Record<string, unknown> = { ...currentLabel };

      for (const attribute of attributes) {
        const changedValue = changes[attribute.name];
        if (changedValue === attribute.value) {
          continue;
        }

        const original = (currentLabel as Record<string, unknown>)[
          attribute.name
        ];
        if (!Array.isArray(original)) {
          continue;
        }

        const newAttributeValue = [...original];
        newAttributeValue[pointIndex] = changedValue;
        newLabel[attribute.name] = newAttributeValue;
        mutated = true;
      }

      if (!mutated || isEqual(newLabel, overlay.label)) {
        return;
      }

      eventBus.dispatch("annotation:sidebarValueUpdated", {
        overlayId: overlay.id,
        currentLabel: overlay.label as KeypointAnnotationLabel["data"],
        value: newLabel as KeypointAnnotationLabel["data"],
      });
    },
    [attributes, eventBus, overlay.id, overlay.label, pointIndex, selectedLabel]
  );

  if (!selectedLabel || attributes.length === 0) {
    return null;
  }

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <Text color={TextColor.Secondary}>
        {pointName ? `${pointName} ` : ""}
        (point {pointIndex + 1} of {pointCount})
      </Text>

      <SchemaIOComponent
        key={`${overlay.id}-${pointIndex}`}
        smartForm={true}
        smartFormProps={{ liveValidate: "onChange" }}
        schema={schema}
        data={data}
        onChange={onChange}
      />
    </Stack>
  );
};

const PointRenderer = ({
  label,
  pointIndex,
  pointName,
  schema,
  forceExpand,
  onExpand,
  onCollapse,
}: {
  label: KeypointAnnotationLabel["data"];
  pointIndex: number;
  pointName: string | null;
  schema: LabelSchemaMeta;
  forceExpand?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const keypointMeta = getKeypointAttributes(label, pointIndex, schema);
  const totalPoints = label?.points?.length ?? 0;

  // allow for controlled behavior to force expansion
  useEffect(() => {
    if (forceExpand) {
      setExpanded(true);
    }
  }, [forceExpand]);

  return (
    <Accordion expanded={expanded} disableGutters>
      <AccordionSummary
        expandIcon={
          <Icon
            name={expanded ? IconName.ChevronTop : IconName.ChevronRight}
            size={Size.Md}
          />
        }
        onClick={() => {
          if (!expanded) {
            onExpand?.();
          } else {
            onCollapse?.();
          }

          setExpanded((prev) => !prev);
        }}
        sx={{ flexDirection: "row-reverse", gap: 1, alignItems: "center" }}
      >
        {pointName ? (
          <Text>{pointName}</Text>
        ) : (
          <Text>Point {pointIndex + 1}</Text>
        )}
      </AccordionSummary>

      <AccordionDetails>
        <PerPointEditor
          attributes={keypointMeta?.attributes}
          pointCount={totalPoints}
          pointIndex={pointIndex}
          pointName={pointName}
        />
      </AccordionDetails>
    </Accordion>
  );
};

export const KeypointDetails = () => {
  const { selectedLabel } = useAnnotationContext();
  const currentData = selectedLabel?.data as KeypointAnnotationLabel["data"];
  const getKeypointSkeleton = useGetKeypointSkeleton();
  const { labelSchema } = useAnnotationSchemaContext();
  const fieldSchema = labelSchema?.[selectedLabel?.path];
  const keypointOverlay = useSelectedKeypointOverlay();
  const selectedPointIndex = useSelectedKeypointIndex();

  const keypointSkeleton = useMemo(() => {
    if (selectedLabel?.path) {
      return getKeypointSkeleton(selectedLabel.path);
    }

    return undefined;
  }, [getKeypointSkeleton, selectedLabel?.path]);

  const pointCount = currentData?.points?.length ?? 0;

  return (
    <>
      <Divider />
      <Box>
        <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
          <Stack orientation={Orientation.Row} justify={Justify.Between}>
            <Stack
              orientation={Orientation.Row}
              align={Align.Center}
              spacing={Spacing.Sm}
            >
              <Text color={TextColor.Secondary}>POINTS</Text>
            </Stack>

            <Text color={TextColor.Secondary}>{pointCount}</Text>
          </Stack>

          {pointCount > 0 && (
            <Stack orientation={Orientation.Column} spacing={Spacing.None}>
              {currentData.points.map((_, idx) => {
                if (selectedLabel?.type !== "Keypoint") {
                  return null;
                }

                return (
                  <PointRenderer
                    key={idx}
                    label={currentData}
                    pointIndex={idx}
                    pointName={keypointSkeleton?.labels?.[idx]}
                    schema={fieldSchema}
                    forceExpand={idx === selectedPointIndex}
                    onExpand={() => keypointOverlay?.setSelectedPointIndex(idx)}
                    onCollapse={() => {
                      if (idx === selectedPointIndex) {
                        keypointOverlay?.setSelectedPointIndex(null);
                      }
                    }}
                  />
                );
              })}
            </Stack>
          )}
        </Stack>
      </Box>
    </>
  );
};
