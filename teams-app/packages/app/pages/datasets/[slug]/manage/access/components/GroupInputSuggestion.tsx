import { Box, UserCard } from "@fiftyone/teams-components";
import {
  Group,
  manageDatasetGroupsSuggestion,
  manageDatasetGroupsSuggestionTermState,
} from "@fiftyone/teams-state";
import {
  DEBOUNCE_TIME,
  MIN_CHARACTER_TO_SEARCH,
} from "@fiftyone/teams-state/src/constants";
import {
  Autocomplete,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import { debounce } from "lodash";
import { manageDatasetGroupsSuggestionQuery$data } from "queries/__generated__/manageDatasetGroupsSuggestionQuery.graphql";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValueLoadable } from "recoil";

type GroupType = manageDatasetGroupsSuggestionQuery$data["userGroups"];

type GroupInputProps = {
  group: Group | null;
  onSelectGroup: (group: Group | null) => void;
};
// @ts-ignore
export default function GroupInputSuggestion(props: GroupInputProps) {
  const [term, setTerm] = useRecoilState(
    manageDatasetGroupsSuggestionTermState
  );
  const [termLocal, setTermLocal] = useState("");
  const [groupOptions, setGroupOptions] = useState<GroupType>([]);
  const { state, contents } =
    useRecoilValueLoadable<manageDatasetGroupsSuggestionQuery$data>(
      manageDatasetGroupsSuggestion
    );

  const options: GroupType = useMemo(() => {
    if (Array.isArray(contents) && contents.length > 0) return contents;
    return [];
  }, [termLocal, contents]);

  useEffect(() => {
    if (state === "hasValue" || !term) setGroupOptions(options);
    if (state !== "loading" || !term) {
    }
  }, [state, term, options]);

  // Debounce the setTerm function to delay the search trigger
  const setTermDebounced = useCallback(
    debounce(
      (value) => {
        if (value.length >= MIN_CHARACTER_TO_SEARCH) {
          setTerm(value);
        }
      },
      DEBOUNCE_TIME,
      { leading: true, trailing: true }
    ),
    [setTerm]
  );

  const onInputChangeHandler = (
    event: React.SyntheticEvent<Element, Event>,
    value: string
  ) => {
    setTermLocal(value);
    setTermDebounced(value);
  };

  return (
    <Autocomplete
      autoHighlight
      freeSolo
      options={groupOptions}
      onChange={(e, group) => {
        e.preventDefault();
        props.onSelectGroup(group as unknown as Group);
        setTerm("");
        setTermLocal("");
      }}
      filterOptions={(options) => {
        return options;
      }}
      inputValue={termLocal}
      onInputChange={onInputChangeHandler}
      value=""
      getOptionLabel={() => ""}
      disabled={Boolean(props.group)}
      renderInput={(params) => {
        return (
          <Box>
            <TextField
              {...params}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {state === "loading" && term && (
                      <CircularProgress size={16} />
                    )}
                    {term && params.InputProps.endAdornment}
                  </>
                ),
              }}
              placeholder="Type group name or slug"
            />
            <Typography
              variant="body1"
              component="div"
              sx={{
                height: 0,
                transition: "height 0.3s ease-in",
                overflow: "hidden",
              }}
            >
              This group does not exist.
            </Typography>
          </Box>
        );
      }}
      renderOption={(props, option) => {
        return (
          <Box component="li" {...props} key={option.name}>
            <UserCard name={option.name} src={""} detailed />
          </Box>
        );
      }}
    />
  );
}
