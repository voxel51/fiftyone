import { useUserRole } from "@fiftyone/hooks";
import { Box, UserCard } from "@fiftyone/teams-components";
import {
  User,
  manageDatasetUsersSuggestion,
  manageDatasetUsersSuggestionTermState,
} from "@fiftyone/teams-state";
import { manageDatasetUsersSuggestionQuery$data } from "@fiftyone/teams-state/src/Dataset/__generated__/manageDatasetUsersSuggestionQuery.graphql";
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
import { capitalize, debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValueLoadable } from "recoil";

type UsersType = manageDatasetUsersSuggestionQuery$data["users"];
interface Props {
  onSelectUser: (user: User) => any;
  user: null | User;
  onlyExistingUsers?: boolean;
}
export default function UserInputSuggestion({
  user,
  onSelectUser,
  onlyExistingUsers = false,
}: Props) {
  const [term, setTerm] = useRecoilState(manageDatasetUsersSuggestionTermState);
  const [termLocal, setTermLocal] = useState("");
  const [users, setUsers] = useState<UsersType>([]);
  const [showNotice, setShowNotice] = useState(false);
  const { canInvite } = useUserRole();

  const { state, contents } =
    useRecoilValueLoadable<manageDatasetUsersSuggestionQuery$data>(
      manageDatasetUsersSuggestion
    );
  const isTermEmail: boolean = useMemo(
    () => isTextEmail(termLocal, canInvite),
    [canInvite, termLocal]
  );
  const options: UsersType = useMemo(() => {
    if (Array.isArray(contents) && contents.length > 0) return contents;
    else if (isTermEmail) return [{ name: termLocal, email: termLocal }];
    return [];
  }, [termLocal, isTermEmail, contents]);

  useEffect(() => {
    console.log("userinputsuggestion options", options);
    if (state === "hasValue" || !term) setUsers(options);
    if (state !== "loading" || !term) {
      setShowNotice(
        !!term && options.length === 0 && !isTextEmail(term, canInvite)
      );
    }
  }, [canInvite, state, term, options]);

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
      options={users}
      onChange={(e, user) => {
        if (user?.id || canInvite) {
          onSelectUser(user);
        }
        setTerm("");
        setTermLocal("");
      }}
      filterOptions={(options: UsersType[]) =>
        onlyExistingUsers ? options.filter((option) => !!option?.id) : options
      }
      inputValue={termLocal}
      onInputChange={onInputChangeHandler}
      value=""
      disabled={Boolean(user)}
      getOptionLabel={() => ""}
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
              placeholder="Type name or email..."
            />
            <Typography
              variant="body1"
              component="div"
              sx={{
                height: showNotice ? 21 : 0,
                transition: "height 0.3s ease-in",
                overflow: "hidden",
              }}
            >
              This person does not have an account
            </Typography>
          </Box>
        );
      }}
      renderOption={(props, option) => {
        return (
          <Box component="li" {...props} key={option.id}>
            <UserCard
              name={option.name}
              email={capitalize(option.role)}
              src={option.picture}
              detailed
            />
          </Box>
        );
      }}
    />
  );
}

// Note: check is intentionally simple to be non-restrictive
function isTextEmail(text: string, enableInvitation: boolean) {
  return enableInvitation && text.includes("@");
}
