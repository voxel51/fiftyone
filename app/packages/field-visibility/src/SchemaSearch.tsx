/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The "Filter rule" tab: the rule input plus the matching schema rows.
 */

import { Tooltip } from "@fiftyone/components";
import { useSchemaSettings, useSearchSchemaFields } from "@fiftyone/state";
import {
  Clickable,
  Icon,
  IconName,
  Input,
  Orientation,
  Size,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { SchemaSelection } from "./SchemaSelection";

interface Props {
  searchTerm?: string;
  setSearchTerm: (value: string) => void;
}

export const SchemaSearch = (props: Props) => {
  const { searchTerm, setSearchTerm } = props;

  const { datasetName, includeNestedFields, mergedSchema } =
    useSchemaSettings();

  const { searchSchemaFields, setSearchResults } =
    useSearchSchemaFields(mergedSchema);

  return (
    <Stack
      orientation={Orientation.Column}
      style={{ position: "relative", marginTop: "1rem" }}
    >
      <div style={{ width: "100%", position: "relative" }}>
        <Input
          data-cy="filter-visibility-filter-rule-input"
          value={searchTerm}
          placeholder="search by fields and attributes"
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && datasetName) {
              if (searchTerm) {
                // convert dot notation to object
                const split = searchTerm.split(":");
                let checkValue = split?.[1] || "";
                let finalSearchTerm = checkValue
                  ? searchTerm.substring(0, searchTerm.indexOf(":"))
                  : searchTerm;
                finalSearchTerm = finalSearchTerm.trim();
                checkValue = checkValue.trim();

                const termSplit = finalSearchTerm.split(".");
                let object: object = {
                  include_nested_fields: includeNestedFields,
                };
                let ref = object;
                if (checkValue && termSplit.length > 0) {
                  termSplit.forEach((prop, index) => {
                    if (index === termSplit.length - 1) {
                      ref[prop] = checkValue;
                    } else {
                      ref[prop] = {};
                    }
                    ref = ref[prop];
                  });
                } else {
                  object = {
                    ...object,
                    ["any"]: finalSearchTerm,
                  };
                }

                searchSchemaFields(object);
              } else {
                setSearchResults([]);
              }
            }
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 36,
            top: "50%",
            transform: "translateY(-50%)",
            display: "inline-flex",
          }}
        >
          <Tooltip text="Hit Enter to see results!" placement="bottom-center">
            <span style={{ display: "inline-flex" }}>
              <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
                Enter &crarr;
              </Text>
            </span>
          </Tooltip>
        </span>
        <Clickable
          role="button"
          tabIndex={0}
          aria-label="Clear filter rule"
          onClick={() => {
            setSearchResults([]);
            setSearchTerm("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSearchResults([]);
              setSearchTerm("");
            }
          }}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            display: "inline-flex",
            alignItems: "center",
            opacity: searchTerm ? 1 : 0.3,
          }}
        >
          <Icon name={IconName.Close} size={Size.Sm} />
        </Clickable>
      </div>
      <div style={{ width: "100%" }}>
        <SchemaSelection />
      </div>
    </Stack>
  );
};
