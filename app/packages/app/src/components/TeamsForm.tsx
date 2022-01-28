import React, { useState } from "react";
import { animated } from "@react-spring/web";
import styled from "styled-components";
import { Close } from "@material-ui/icons";
import { useRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import { http } from "../shared/connection";

const Container = styled("div")`
  position: fixed;
  z-index: 10000;
  width: 0 auto;
  bottom: ${(props) => (props.top ? "unset" : "2em")};
  margin: 0 auto;
  right: 2em;
  font-weight: bold;
  display: flex;
  flex-direction: ${(props) => (props.top ? "column-reverse" : "column")};
  align-items: ${(props) =>
    props.position === "center" ? "center" : `flex-${props.position || "end"}`};
  @media (max-width: 680px) {
    align-items: center;
  }
`;

const Message = styled(animated.div)`
  margin-top: 1em;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  width: 40ch;
  @media (max-width: 680px) {
    width: 100%;
  }
`;

const MessageTitle = styled.h3`
  font-size: 1.5em;
  color: ${({ theme }) => theme.font};
`;

const ContentDiv = styled.div`
  color: ${({ theme }) => theme.font};
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  box-shadow: 0 2px 40px ${({ theme }) => theme.backgroundDark};
  padding: 1em 2em 0 2em;
  font-size: 1em;
  overflow: hidden;
  height: auto;
  border-radius: 3px;
`;

const Button = styled.button`
  cursor: pointer;
  outline: 0;
  border: none;
  background: transparent;
  display: flex;
  align-self: flex-end;
  position: abo
  overflow: hidden;
  margin: 0;
  padding: 0;
  padding-bottom: 2em;
  color: ${({ theme }) => theme.fontDark};
  :hover {
    color: ${({ theme }) => theme.font};
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`;

const Life = animated(styled.div`
  position: absolute;
  bottom: ${(props) => (props.top ? "0.5em" : "0")};
  left: 0px;
  width: auto;
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  background-image: linear-gradient(
    130deg,
    ${({ theme }) => theme.brand},
    ${({ theme }) => theme.brandFullyTransparent}
  );
  height: 0.5em;
`);

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
  text-overflow: ellipsis;
  overflow: hidden;

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

const Content = () => {
  const [formState, setFormState] = useState({
    email: "",
    firstname: "",
    lastname: "",
    company: "",
    role: "",
    discover: "",
  });
  const [submitText, setSubmitText] = useState("Submit");
  const [teams, setTeams] = useRecoilState(atoms.teams);
  const portalId = 4972700;
  const formId = "87aa5367-a8f1-4ed4-9e23-1fdf8448d807";
  const postUrl = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;

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
    ) || teams.submitted;
  const submit = () => {
    if (disabled) {
      return;
    }
    setSubmitText("Submitting...");
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    const finalize = () => {
      setSubmitText("Submitted. Thank you!");
      setTeams((cur) => ({ ...cur, submitted: true }));
      fetch(`${http}/teams?submitted=true`, { method: "post" });
      setTimeout(() => setTeams((cur) => ({ ...cur, open: false })), 2000);
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
    <ContentDiv>
      <Header>
        <MessageTitle>Get FiftyOne for your team</MessageTitle>
        <Button onClick={(e) => setTeams((cur) => ({ ...cur, open: false }))}>
          <Close />
        </Button>
      </Header>
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
    </ContentDiv>
  );
};

const TeamsForm = React.memo(() => {
  return (
    <Container>
      <Message>
        <Content />
      </Message>
    </Container>
  );
});

export default TeamsForm;
