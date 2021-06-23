import React, {
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import AuosizeInput from "react-input-autosize";
import { Machine, assign } from "xstate";
import { useMachine } from "@xstate/react";
import uuid from "uuid-v4";
import { animated, useSpring } from "react-spring";
import { ThemeContext } from "styled-components";
import { Close, Group } from "@material-ui/icons";
import { GitHub, MenuBook } from "@material-ui/icons";

import { BestMatchDiv } from "./ViewBar/ViewStage/BestMatch";
import ErrorMessage from "./ViewBar/ViewStage/ErrorMessage";
import { getMatch, computeBestMatchString } from "./ViewBar/ViewStage/utils";
import SearchResults from "./ViewBar/ViewStage/SearchResults";
import ExternalLink from "./ExternalLink";
import { Slack } from "../icons";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket, { http } from "../shared/connection";
import { useTheme } from "../utils/hooks";
import { packageMessage } from "../utils/socket";

const DatasetContainerInput = styled.div`
  font-size: 1.2rem;
  display: flex;
  border-bottom: 1px ${({ theme }) => theme.brand} solid;
`;

const DatasetInput = styled(AuosizeInput)`
  & input {
    background-color: transparent;
    border: none;
    color: ${({ theme }) => theme.font};
    height: 40px;
    font-size: 1.2rem;
    border: none;
    align-items: center;
    font-weight: bold;
  }

  & input:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.font};
    font-weight: bold;
  }
`;

const HeaderDiv = styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  width: 100%;
  border-bottom: 1px ${({ theme }) => theme.backgroundDarkBorder} solid;
`;

const TitleDiv = styled.div`
  margin-right: 1rem;
  cursor: pointer;
  height: 40px;
  display: flex;
`;

const LogoImg = animated(styled.img`
  height: 100%;
  width: auto;
  cursor: pointer;
  margin-right: 1rem;
  will-change: transform;
`);

const LeftDiv = styled.div`
  display: flex;
  padding: 1rem;
`;

const RightDiv = styled.div`
  margin-left: auto;
  padding-right: 0.5rem;
  display: flex;
`;

const FiftyOneDiv = styled.div`
  color: ${(theme) => theme.font};
  font-weight: bold;
  font-size: 1.8rem;
  align-items: center;
  display: flex;
`;

const DatasetDiv = styled.div`
  font-weight: bold;
  padding-left: 1rem;
  border-left-width: 1px;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
  border-left-style: solid;
`;

const IconWrapper = styled.div`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;

  a {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    margin-right: 0.5em;
  }

  svg:focus {
    outline: none;
  }
`;

const Button = styled.div`
  font-weight: bold;
  cursor: pointer;
  font-size: 1rem;
  border-radius: 3px;
  text-align: center;
  padding: 0 0.5rem;
  border: 1px solid ${({ theme }) => theme.brand};

  &.disabled {
    border: 1px solid ${({ theme }) => theme.fontDark};
    cursor: default;
  }
`;

const selectorMachine = Machine({
  id: "selectorMachine",
  initial: "reading",
  context: {
    error: undefined,
    values: [],
    value: "",
    selected: [],
    currentResult: null,
    errorId: null,
    results: [],
    prevValue: "",
    bestMatch: {},
    onCommit: () => {},
  },
  states: {
    reading: {
      entry: assign({
        errorId: null,
      }),
      on: {
        EDIT: {
          target: "editing",
        },
      },
    },
    editing: {
      entry: [
        assign({
          errorId: null,
          currentResult: ({ values, value }) => values.indexOf(value),
          prevValue: ({ value }) => value,
          results: ({ values }) => values,
          bestMatch: ({ values, value }) =>
            computeBestMatchString(values, value),
        }),
      ],
      type: "parallel",
      states: {
        input: {
          initial: "focused",
          states: {
            focused: {
              on: {
                UNFOCUS_INPUT: "unfocused",
              },
            },
            unfocused: {
              on: {
                FOCUS_INPUT: "focused",
              },
            },
          },
        },
        searchResults: {
          initial: "notHovering",
          states: {
            hovering: {
              on: {
                MOUSELEAVE: "notHovering",
              },
            },
            notHovering: {
              on: {
                MOUSEENTER: "hovering",
              },
            },
          },
        },
      },
      on: {
        NEXT_RESULT: {
          actions: assign({
            currentResult: ({ currentResult, results }) => {
              if (currentResult === null) return 0;
              return Math.min(currentResult + 1, results.length - 1);
            },
            value: ({ currentResult, results }) => {
              if (currentResult === null) return results[0];
              return results[Math.min(currentResult + 1, results.length - 1)];
            },
            bestMatch: {},
          }),
        },
        PREVIOUS_RESULT: {
          actions: assign({
            currentResult: ({ currentResult }) => {
              if (currentResult === 0 || currentResult === null) return null;
              return currentResult - 1;
            },
            value: ({ currentResult, prevValue, results }) => {
              if (currentResult === 0 || currentResult === null)
                return prevValue;
              return results[currentResult - 1];
            },
            bestMatch: {},
          }),
        },
        BLUR: {
          target: "reading",
          actions: [
            assign({
              value: ({ value, prevValue, values }) => prevValue,
            }),
          ],
        },
        COMMIT: [
          {
            target: "reading",
            actions: [
              assign({
                value: (_, { value }) => value,
                valid: true,
              }),
              ({ onCommit, prevValue }, { value }) => {
                value !== prevValue && onCommit(value);
              },
            ],
            cond: ({ values }, { value }) => {
              return values.some((v) => v === value);
            },
          },
          {
            actions: assign({
              error: (_, { value }) => ({
                name: "name",
                error: `${value === "" ? '""' : value} does not exist`,
              }),
              errorId: uuid(),
              valid: false,
            }),
          },
        ],
        CHANGE: {
          actions: [
            assign({
              value: (_, { value }) => value,
              results: ({ values }) => values,
              errorId: null,
              currentResult: ({ values }, { value }) => {
                const i = values.indexOf(value);
                if (i > 0) return i;
                return null;
              },
              bestMatch: ({ values }, { value }) =>
                computeBestMatchString(values, value),
            }),
          ],
        },
      },
    },
  },
  on: {
    SET_VALUES: {
      target: "reading",
      actions: [
        assign({
          value: (_, { value }) => value,
          values: (_, { values }) => values,
          onCommit: (_, { onCommit }) => onCommit,
        }),
      ],
    },
  },
});

const Input = styled.input`
  width: 100%;
  background-color: transparent;
  border: none;
  padding: 0.5rem 0;
  margin-bottom: 1rem;
  border
  color: ${({ theme }) => theme.font};
  line-height: 1rem;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.brand};
  font-weight: bold;

  &:focus {
    border-bottom: 1px solid ${({ theme }) => theme.brand};
    outline: none;
    font-weight: bold;
  }

  &::placeholder {
    color: ${({ theme }) => theme.fontDark};
    font-weight: bold;
  }
`;

const TeamsForm = () => {
  const [formState, setFormState] = useState({
    email: "",
    firstname: "",
    lastname: "",
    company: "",
    role: "",
    discover: "",
  });
  const [submitText, setSubmitText] = useState("Submit");
  const [submitted, setSubmitted] = useRecoilState(atoms.teamsSubmitted);
  const portalId = 4972700;
  const formId = "87aa5367-a8f1-4ed4-9e23-1fdf8448d807";
  const postUrl = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;
  const closeTeams = useRecoilValue(atoms.closeTeams);
  const theme = useTheme();

  const setFormValue = (name) => (e) =>
    setFormState({
      ...formState,
      [name]: e.target.value,
    });
  const disabled =
    !(
      formState.email?.length &&
      formState.firstname?.length &&
      formState.lastname?.length
    ) || submitted.submitted;
  const submit = () => {
    if (disabled) {
      return;
    }
    setSubmitText("Submitting...");
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    const finalize = () => {
      setSubmitText("Submitted. Thank you!");
      setSubmitted({ ...submitted, submitted: true });
      fetch(`${http}/teams?submitted=true`, { method: "post" });
      setTimeout(() => closeTeams && closeTeams.close(), 2000);
    };

    fetch(postUrl, {
      method: "post",
      headers,
      mode: "cors",
      body: JSON.stringify({
        submittedAt: Date.now(),
        fields: [
          {
            name: "firstname",
            value: formState.firstname,
          },
          {
            name: "lastname",
            value: formState.lastname,
          },
          {
            name: "email",
            value: formState.email,
          },
          {
            name: "company",
            value: formState.company,
          },
          {
            name: "role",
            value: formState.role,
          },
          {
            name: "app_how_did_you_hear_about_us",
            value: formState.discover,
          },
        ],
        context: { pageName: "FiftyOne App" },
      }),
    })
      .then((response) => {
        if (response.status !== 200) {
          throw new Error("Failed submission");
        }
        return response.json();
      })
      .then(() => {
        finalize();
      })
      .catch((e) => {
        setSubmitText("Something went wrong");
      });
  };
  return (
    <>
      <Input
        key="firstname"
        placeholder={"First name*"}
        value={formState.firstname ?? ""}
        maxLength={40}
        onChange={setFormValue("firstname")}
      />
      <Input
        key="lastname"
        placeholder={"Last name*"}
        value={formState.lastname ?? ""}
        maxLength={40}
        onChange={setFormValue("lastname")}
      />
      <Input
        key="email"
        placeholder={"Email*"}
        type="email"
        value={formState.email ?? ""}
        onChange={setFormValue("email")}
      />
      <Input
        key="company"
        placeholder={"Company"}
        value={formState.company ?? ""}
        maxLength={100}
        onChange={setFormValue("company")}
      />
      <Input
        key="role"
        placeholder={"Role"}
        value={formState.role ?? ""}
        maxLength={100}
        onChange={setFormValue("role")}
      />
      <Input
        key="discover"
        placeholder={"How did you hear about FiftyOne?"}
        value={formState.discover ?? ""}
        maxLength={100}
        onChange={setFormValue("discover")}
      />
      <Button
        key="submit"
        onClick={submit}
        style={{
          marginBottom: "1rem",
        }}
        className={disabled ? "disabled" : ""}
      >
        {submitText}
      </Button>
    </>
  );
};

const DatasetSelector = () => {
  const datasetName = useRecoilValue(selectors.datasetName);
  const datasets = useRecoilValue(selectors.datasets);
  const [state, send] = useMachine(selectorMachine);
  const connected = useRecoilValue(atoms.connected);
  const resetStats = useResetRecoilState(atoms.datasetStatsRaw);
  const resetExtStats = useResetRecoilState(atoms.extendedDatasetStatsRaw);

  const inputRef = useRef();
  const { results, currentResult, value, bestMatch, values } = state.context;
  useEffect(() => {
    send({
      type: "SET_VALUES",
      value: datasetName ?? "",
      values: datasets,
      onCommit: (v) => {
        resetStats();
        resetExtStats();
        socket.send(packageMessage("set_dataset", { dataset_name: v }));
      },
    });
  }, [datasetName, datasets, socket]);

  const isEditing = state.matches("editing");
  useEffect(() => {
    isEditing && inputRef.current && inputRef.current.focus();
    !isEditing && inputRef.current && inputRef.current.blur();
  }, [isEditing, inputRef.current]);

  return (
    <DatasetDiv>
      <DatasetContainerInput>
        <DatasetInput
          placeholder={
            datasets.length > 0 ? "Select a dataset" : "No datasets available"
          }
          disabled={!datasets.length}
          value={connected ? value : "Not connected"}
          onFocus={() => state.matches("reading") && send("EDIT")}
          onBlur={(e) => {
            state.matches("editing.searchResults.notHovering") && send("BLUR");
          }}
          ref={inputRef}
          onChange={(e) => send({ type: "CHANGE", value: e.target.value })}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              const match = getMatch(values, e.target.value);
              send({
                type: "COMMIT",
                value: match
                  ? match
                  : bestMatch.value
                  ? bestMatch.value
                  : e.target.value,
              });
            }
          }}
          onKeyDown={(e) => {
            switch (e.key) {
              case "Escape":
                send("BLUR");
                break;
              case "ArrowDown":
                send("NEXT_RESULT");
                break;
              case "ArrowUp":
                send("PREVIOUS_RESULT");
                break;
              case "ArrowRight":
                e.target.selectionStart === e.target.value.length &&
                  bestMatch.value &&
                  send({ type: "CHANGE", value: bestMatch.value });
                break;
            }
          }}
        />
        {state.matches("editing") || value === "" ? (
          <BestMatchDiv
            style={{
              height: "40px",
              margin: "-1px 0 0 -2px",
              fontSize: "1.2rem",
              alignItems: "center",
            }}
          >
            {bestMatch ? bestMatch.placeholder : ""}
          </BestMatchDiv>
        ) : null}
      </DatasetContainerInput>
      {state.matches("editing") && (
        <SearchResults
          results={results}
          send={send}
          currentResult={currentResult}
          bestMatch={bestMatch.value}
          style={{
            marginTop: 8,
            fontSize: "1.2rem",
            maxHeight: 212,
            overflowY: "scroll",
          }}
        />
      )}
      <ErrorMessage machine={[state, send]} style={{ marginTop: 8 }} />
    </DatasetDiv>
  );
};

const TeamsButton = ({ addNotification }) => {
  const [appTeamsIsOpen, setAppTeamsIsOpen] = useRecoilState(
    atoms.appTeamsIsOpen
  );
  const [teamsSubmitted, setTeamsSubmitted] = useRecoilState(
    atoms.teamsSubmitted
  );
  const [closeTeams, setCloseTeams] = useRecoilState(atoms.closeTeams);
  const text = (
    <span>
      FiftyOne is and will always be open source software that is freely
      available to individual users, all 20,000 and counting. However, if you’re
      part of a team, you may need more. That’s why we’ve begun deploying
      team-based versions of FiftyOne with multi-user collaboration features to
      early adopters.
      <br />
      <br />
      Are you interested in a team-based deployment of FiftyOne? Let us know how
      to contact you and our founders will reach out to make it happen!
    </span>
  );
  const theme = useContext(ThemeContext);
  const showTeamsButton = useRecoilValue(selectors.showTeamsButton);

  const onClick = () => {
    if (!appTeamsIsOpen) {
      setAppTeamsIsOpen(true);
      const callback = addNotification.current({
        kind: "Get FiftyOne for your team",
        message: text,
        children: [<TeamsForm key="teams" />],
        onClose: () => setAppTeamsIsOpen(false),
      });
      setCloseTeams({ close: callback });
    }
  };

  return showTeamsButton === "shown" ? (
    <Button
      onClick={onClick}
      style={{ marginRight: "0.5rem", position: "relative" }}
    >
      Have a team?
      <div
        style={{
          position: "absolute",
          top: "-0.8rem",
          right: "-0.8rem",
        }}
      >
        <Close
          style={{
            borderRadius: "1rem",
            background: theme.brand,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setTeamsSubmitted({ ...teamsSubmitted, minimized: true });
            fetch(`${http}/teams`, { method: "post" });
            closeTeams && closeTeams.close();
          }}
        />
      </div>
    </Button>
  ) : showTeamsButton === "minimized" ? (
    <Group
      style={{ cursor: "pointer", marginRight: "0.5em" }}
      onClick={onClick}
    />
  ) : null;
};

const Header = ({ addNotification }) => {
  const refresh = useRecoilValue(selectors.refresh);
  const logoProps = useSpring({
    transform: refresh ? `rotate(0turn)` : `rotate(1turn)`,
  });

  return (
    <HeaderDiv>
      <LeftDiv>
        <TitleDiv onClick={() => socket.send(packageMessage("refresh", {}))}>
          <LogoImg style={logoProps} src={"./logo.png"} />
          <FiftyOneDiv className="fix-me">FiftyOne</FiftyOneDiv>
        </TitleDiv>
        <DatasetSelector />
      </LeftDiv>
      <RightDiv>
        <IconWrapper>
          <Suspense fallback={null}>
            <TeamsButton addNotification={addNotification} />
          </Suspense>
          <ExternalLink
            title="Slack"
            href="https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg"
          >
            <Slack />
          </ExternalLink>
          <ExternalLink
            title="GitHub"
            href="https://github.com/voxel51/fiftyone"
          >
            <GitHub />
          </ExternalLink>
          <ExternalLink
            title="Documentation"
            href="https://voxel51.com/docs/fiftyone/user_guide/app.html"
          >
            <MenuBook />
          </ExternalLink>
        </IconWrapper>
      </RightDiv>
    </HeaderDiv>
  );
};

export default Header;
