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
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValueLoadable } from "recoil";
import * as EmailValidation from "email-validator";

type SuggestedUsersType = manageDatasetUsersSuggestionQuery$data["users"];
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
  const [users, setUsers] = useState<SuggestedUsersType>([]);
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
  const suggestedUsers: SuggestedUsersType = useMemo(() => {
    if (Array.isArray(contents) && contents.length > 0) return contents;
    else if (isTermEmail) return [{ name: termLocal, email: termLocal }];
    return [];
  }, [termLocal, isTermEmail, contents]);

  useEffect(() => {
    if (state === "hasValue" || !term) setUsers(suggestedUsers);
    if (state !== "loading" || !term) {
      setShowNotice(
        !!term && suggestedUsers.length === 0 && !isTextEmail(term, canInvite)
      );
    }
  }, [canInvite, state, term, suggestedUsers]);

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
      filterOptions={(options: SuggestedUsersType[]) =>
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
              This person does not have an account. Enter their email to invite.
            </Typography>
          </Box>
        );
      }}
      renderOption={(props, option) => {
        return (
          <Box component="li" {...props} key={option.id || option.name}>
            <UserCard
              id={option.id}
              name={option.name}
              email={option.email}
              role={option.role}
              src={option.picture}
              bgColor={option.id ? undefined : "gray"}
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
  return enableInvitation && EmailValidation.validate(text);
}
