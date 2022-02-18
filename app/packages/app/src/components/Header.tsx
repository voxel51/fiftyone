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

const url = `${http}/dataset`;

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

export default Header;
