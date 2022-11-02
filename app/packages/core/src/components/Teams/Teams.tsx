import { Close } from "@mui/icons-material";
import React, { useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";

import { Button } from "@fiftyone/components";

import { form, header, text } from "./Teams.module.css";
import { graphql, useMutation } from "react-relay";
import * as fos from "@fiftyone/state";

const Teams = () => {
  const [formState, setFormState] = useState({
    email: "",
    firstname: "",
    lastname: "",
    company: "",
    role: "",
  });
  const [submitText, setSubmitText] = useState("Submit");
  const [teams, setTeams] = useRecoilState(fos.teams);
  const setOpen = useSetRecoilState(fos.appTeamsIsOpen);
  const portalId = 4972700;
  const formId = "87aa5367-a8f1-4ed4-9e23-1fdf8448d807";
  const postUrl = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;
  const [commit] = useMutation(graphql`
    mutation TeamsStoreTeamsSubmissionMutation {
      storeTeamsSubmission
    }
  `);

  const setFormValue = (name) => (e) =>
    setFormState({
      ...formState,
      [name]: e.target.value,
    });

  const submit = () => {
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
        setSubmitText("Submitted. Thank you!");
        setTeams((cur) => ({ ...cur, submitted: true }));
        commit({ variables: {} });
        setTimeout(() => setOpen(false), 2000);
      })
      .catch((e) => {
        setSubmitText("Something went wrong");
      });
  };
  return (
    <div className={form}>
      <div className={header}>
        <h3>Get FiftyOne for your team</h3>

        <Button
          onClick={() => setOpen(false)}
          style={{ display: "flex", alignItems: "center", padding: 0 }}
        >
          <Close />
        </Button>
      </div>
      <div className={text}>
        FiftyOne is and will always be open source software that is freely
        available to individual users, all 35,000 and counting. However, if
        you’re part of a team, you may need more. That’s why we’ve begun
        deploying team-based versions of FiftyOne with multi-user collaboration
        features to early adopters.
        <br />
        <br />
        Are you interested in a team-based deployment of FiftyOne? Let us know
        how to contact you and our founders will reach out to make it happen!
      </div>
      <input
        key="firstname"
        placeholder={"First name*"}
        value={formState.firstname ?? ""}
        maxLength={40}
        onChange={setFormValue("firstname")}
      />
      <input
        key="lastname"
        placeholder={"Last name*"}
        value={formState.lastname ?? ""}
        maxLength={40}
        onChange={setFormValue("lastname")}
      />
      <input
        key="email"
        placeholder={"Email*"}
        type="email"
        value={formState.email ?? ""}
        onChange={setFormValue("email")}
      />
      <input
        key="company"
        placeholder={"Company"}
        value={formState.company ?? ""}
        maxLength={100}
        onChange={setFormValue("company")}
      />
      <input
        key="role"
        placeholder={"Role"}
        value={formState.role ?? ""}
        maxLength={100}
        onChange={setFormValue("role")}
      />
      <Button
        key="submit"
        onClick={submit}
        disabled={
          !(
            formState.email?.length &&
            formState.firstname?.length &&
            formState.lastname?.length
          ) || teams.submitted
        }
        style={{
          color: "unset",
        }}
      >
        {submitText}
      </Button>
    </div>
  );
};

export default Teams;
