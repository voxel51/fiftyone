import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useRecoilState, useRecoilValue } from "recoil";
import AuosizeInput from "react-input-autosize";
import { Machine, assign } from "xstate";
import { useMachine } from "@xstate/react";
import uuid from "uuid-v4";
import { BestMatchDiv } from "./ViewBar/ViewStage/BestMatch";
import ErrorMessage from "./ViewBar/ViewStage/ErrorMessage";
import { getMatch, computeBestMatchString } from "./ViewBar/ViewStage/utils";
import { packageMessage } from "../utils/socket";
import { animated, useSpring } from "react-spring";

import ExternalLink from "./ExternalLink";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { Email, GitHub, MenuBook } from "@material-ui/icons";
import { Slack } from "../icons";
import SearchResults from "./ViewBar/ViewStage/SearchResults";

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
    line-height: 40px;
    font-size: 1.2rem;
    border: none;
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
    color: ${({ theme }) => theme.font};
    font-weight: bold;
  }
`;

const TshirtForm = () => {
  const [formState, setFormState] = useState({});
  const [submitText, setSubmitText] = useState("Submit");
  const portalId = 4972700;
  const formId = "b56682f6-c297-4cea-95c4-9e05a00528af";
  const postUrl = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;
  const appContext = useRecoilValue(selectors.appContext);

  const setFormValue = (name) => (e) =>
    setFormState({
      ...formState,
      [name]: e.target.value,
    });
  const submit = () => {
    if (!(formState.helping?.length && formState.improve?.length)) {
      return;
    }
    setSubmitText("Submitting...");
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    fetch(postUrl, {
      method: "post",
      headers,
      mode: "cors",
      body: JSON.stringify({
        submittedAt: Date.now(),
        fields: [
          {
            name: "email",
            value: formState.email,
          },
          {
            name: "is_fiftyone_helping_your_work_how_so_",
            value: formState.helping,
          },
          {
            name: "how_could_we_improve_fiftyone_",
            value: formState.improve,
          },
          {
            name: "app_context",
            value: appContext,
          },
        ],
        context: { pageUri: "www.example.com/page", pageName: "Example page" },
      }),
    })
      .then((response) => {
        if (response.status !== 200) {
          throw new Error("Failed submission");
        }
        return response.json();
      })
      .then(() => {
        setSubmitText("Submitted. Thank you!");
      })
      .catch(() => setSubmitText("Something went wrong"));
  };
  return (
    <>
      <Input
        key="email"
        placeholder={"Email (optional)"}
        type="email"
        value={formState.email ?? ""}
        onChange={setFormValue("email")}
      />
      <Input
        key="helping"
        placeholder={"Is FiftyOne helping your work?"}
        value={formState.helping ?? ""}
        onChange={setFormValue("helping")}
        maxlength={40}
      />
      <Input
        key="improve"
        placeholder={"How could we improve FiftyOne?"}
        value={formState.improve ?? ""}
        maxlength={40}
        onChange={setFormValue("improve")}
      />
      <Button key="submit" onClick={submit} style={{ marginBottom: "1rem" }}>
        {submitText}
      </Button>
    </>
  );
};

const DatasetSelector = () => {
  const datasetName = useRecoilValue(selectors.datasetName);
  const socket = useRecoilValue(selectors.socket);
  const datasets = useRecoilValue(selectors.datasets);
  const [state, send] = useMachine(selectorMachine);
  const connected = useRecoilValue(atoms.connected);

  const inputRef = useRef();
  const { results, currentResult, value, bestMatch, values } = state.context;
  useEffect(() => {
    send({
      type: "SET_VALUES",
      value: datasetName ?? "",
      values: datasets,
      onCommit: (v) => {
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
          <BestMatchDiv style={{ lineHeight: "40px", margin: 0 }}>
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

const Header = ({ addNotification }) => {
  const socket = useRecoilValue(selectors.socket);
  const [refresh, setRefresh] = useRecoilState(atoms.refresh);
  const logoProps = useSpring({
    transform: refresh ? `rotate(0turn)` : `rotate(1turn)`,
  });
  const [appFeedbackIsOpen, setAppFeedbackIsOpen] = useRecoilState(
    atoms.appFeedbackIsOpen
  );
  return (
    <HeaderDiv>
      <LeftDiv>
        <TitleDiv
          onClick={() => {
            socket.send(packageMessage("refresh", {}));
            setRefresh(!refresh);
          }}
        >
          <LogoImg style={logoProps} src={"./logo.png"} />
          <FiftyOneDiv>FiftyOne</FiftyOneDiv>
        </TitleDiv>
        <DatasetSelector />
      </LeftDiv>
      <RightDiv>
        <IconWrapper>
          <Button
            onClick={() => {
              !appFeedbackIsOpen && setAppFeedbackIsOpen(true);
              !appFeedbackIsOpen &&
                addNotification.current({
                  kind: "We'd love your feedback",
                  message:
                    "We are super focused on making FiftyOne as valuable as possible to our users. If you provide your email in this form, we'll get in touch with you about mailing a free T-shirt to you. While supplies last!",
                  children: [<TshirtForm key="t-shirt" />],
                });
            }}
            style={{ marginRight: "0.5rem" }}
          >
            Want a free T-shirt?
          </Button>
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
