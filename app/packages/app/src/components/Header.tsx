import React, { Suspense, useContext, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import AuosizeInput from "react-input-autosize";
import { Machine, assign } from "xstate";
import { useMachine } from "@xstate/react";
import { v4 as uuid } from "uuid";
import { animated, useSpring } from "@react-spring/web";
import { ThemeContext } from "styled-components";
import { Close, Group } from "@material-ui/icons";
import { GitHub, MenuBook } from "@material-ui/icons";

import ViewBar from "./ViewBar/ViewBar";
import { BestMatchDiv } from "./ViewBar/ViewStage/BestMatch";
import ErrorMessage from "./ViewBar/ViewStage/ErrorMessage";
import { getMatch, computeBestMatchString } from "./ViewBar/ViewStage/utils";
import SearchResults from "./ViewBar/ViewStage/SearchResults";
import { Slack } from "../icons";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket, { http } from "../shared/connection";
import { ExternalLink } from "../utils/generic";

import Logo from "../images/logo.png";
import { useRefresh } from "../utils/hooks";

const DatasetContainerInput = styled.div`
  font-size: 1.2rem;
  display: flex;
  overflow: hidden;
  border-bottom: 1px ${({ theme }) => theme.brand} solid;
  & > div:last-child {
    display: none;
  }
`;

const DatasetInput = styled(AuosizeInput)`
  overflow: hidden;
  & input {
    background-color: transparent;
    border: none;
    color: ${({ theme }) => theme.font};
    height: 40px;
    font-size: 1.2rem;
    border: none;
    align-items: center;
    font-weight: bold;
    text-overflow: ellipsis;
    max-width: 300px;
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
  background-color: ${({ theme }) => theme.background};
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
  height: 40px;
  width: 40px;
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
  white-space: nowrap;
`;

const DatasetDiv = styled.div`
  font-weight: bold;
  padding-left: 1rem;
  border-left-width: 1px;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
  border-left-style: solid;
  overflow: hidden;
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

const url = `${http}/dataset`;

const DatasetSelector = ({ error }: { error: boolean }) => {
  const datasetName = useRecoilValue(selectors.datasetName);
  const datasets = useRecoilValue(selectors.datasets);
  const [state, send] = useMachine(selectorMachine);
  const connected = useRecoilValue(atoms.connected);
  const inputRef = useRef();
  const { results, currentResult, value, bestMatch, values } = state.context;
  useLayoutEffect(() => {
    send({
      type: "SET_VALUES",
      value: datasetName ?? "",
      values: datasets,
      onCommit: (dataset) => {
        fetch(url, {
          method: "POST",
          cache: "no-cache",
          headers: {
            "Content-Type": "application/json",
          },
          mode: "cors",
          body: JSON.stringify({ dataset }),
        });
      },
    });
  }, [datasetName, datasets, socket]);

  const isEditing = state.matches("editing");
  useLayoutEffect(() => {
    isEditing && inputRef.current && inputRef.current.focus();
    !isEditing && inputRef.current && inputRef.current.blur();
  }, [isEditing, inputRef.current]);

  const title =
    connected && !error
      ? value
      : error
      ? "Oops! Something went wrong"
      : "Not connected";
  return (
    <DatasetDiv title={title}>
      <DatasetContainerInput>
        <DatasetInput
          placeholder={
            datasets.length > 0 ? "Select a dataset" : "No datasets available"
          }
          disabled={!datasets.length || error}
          value={title}
          onFocus={() => state.matches("reading") && send("EDIT")}
          onBlur={(e) => {
            state.matches("editing.searchResults.notHovering") && send("BLUR");
          }}
          style={{ minWidth: 100 }}
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
  const setTeams = useSetRecoilState(atoms.teams);
  const text = (
    <span>
      FiftyOne is and will always be open source software that is freely
      available to individual users, all 35,000 and counting. However, if you’re
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

  const onClick = () => setTeams((cur) => ({ ...cur, open: true }));

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
            setTeams((cur) => ({ ...cur, minimized: true }));
            fetch(`${http}/teams`, { method: "post" });
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

const Header = ({
  addNotification,
  error,
}: {
  error?: boolean;
  addNotification?: React.MutableRefObject<any>;
}) => {
  const refresh = useRecoilValue(selectors.refresh);
  const logoProps = useSpring({
    transform: refresh ? `rotate(0turn)` : `rotate(1turn)`,
  });
  const refreshState = useRefresh();

  const dataset = useRecoilValue(selectors.hasDataset);
  return (
    <HeaderDiv>
      <LeftDiv>
        <TitleDiv onClick={refreshState}>
          <LogoImg style={logoProps} src={Logo} />
          <FiftyOneDiv className="fix-me">FiftyOne</FiftyOneDiv>
        </TitleDiv>
        <DatasetSelector error={error} />
      </LeftDiv>
      {dataset && !error && <ViewBar key={"bar"} />}
      <RightDiv>
        <IconWrapper>
          {addNotification && (
            <Suspense fallback={null}>
              <TeamsButton addNotification={addNotification} />
            </Suspense>
          )}
          <ExternalLink
            title="Slack"
            href="https://join.slack.com/t/fiftyone-users/shared_invite/zt-s6936w7b-2R5eVPJoUw008wP7miJmPQ"
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
