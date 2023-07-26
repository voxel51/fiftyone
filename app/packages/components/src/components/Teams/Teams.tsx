import React, { useState } from "react";
import { Close } from "@mui/icons-material";
import { useRecoilState } from "recoil";

import { getFetchFunction } from "@fiftyone/utilities";

const Teams = () => {
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
  const formId = "bca87445-10be-424c-9c07-e2b16770caf6";
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
      getFetchFunction()("POST", "/teams?submitted=true", {});
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

export default Teams;
