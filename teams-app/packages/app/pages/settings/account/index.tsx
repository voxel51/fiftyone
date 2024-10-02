import { useCurrentUser } from "@fiftyone/hooks";
import {
  Container,
  SectionHeader,
  SettingsLayout,
  TextInput,
  UserCard,
} from "@fiftyone/teams-components";
import { Group, mainTitleSelector } from "@fiftyone/teams-state";
import { Grid, FormControlLabel, Switch, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useSetRecoilState } from "recoil";
import GroupsSection from "./GroupsSection";
import { FIFTYONE_DO_NOT_TRACK_LS } from "@fiftyone/teams-state/src/constants";

export default function Account() {
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    const doNotTrack = window.localStorage.getItem(FIFTYONE_DO_NOT_TRACK_LS);
    if (doNotTrack === "true") {
      setAnalyticsTracking(false);
    } else {
      setAnalyticsTracking(true);
    }
    setPageTitle("Settings");
  }, []);

  const [currentUser] = useCurrentUser();
  const { name, email, picture, userGroups = [], role } = currentUser || {};
  const canSeeGroups = role !== "GUEST";
  const [analyticsTracking, setAnalyticsTracking] = useState(true);

  const handleAnalyticsTrackingChange = (event) => {
    window.localStorage.setItem(
      FIFTYONE_DO_NOT_TRACK_LS,
      event.target.checked ? "false" : "true"
    );
    setAnalyticsTracking(event.target.checked);
  };

  return (
    <SettingsLayout>
      <SectionHeader title="Account" />
      <Container>
        <Grid container columnSpacing={4} alignItems="center" paddingTop={1}>
          <Grid item>
            <UserCard name={name ?? ""} src={picture ?? undefined} />
          </Grid>
          <Grid item>
            <TextInput
              fieldLabel="Full name"
              id="name"
              label={name}
              variant="outlined"
              disabled
              size="small"
            />
          </Grid>
          <Grid item>
            <TextInput
              fieldLabel="Email"
              id="email"
              label={email}
              variant="outlined"
              disabled
              size="small"
            />
          </Grid>
        </Grid>
      </Container>
      {canSeeGroups && <GroupsSection groups={userGroups as Group[]} />}
      <Container>
        <SectionHeader
          title="User Data Privacy"
          description="We track user activity within our app to improve the overall experience."
        />
        <FormControlLabel
          control={
            <Switch
              checked={analyticsTracking}
              onChange={handleAnalyticsTrackingChange}
              color="primary"
            />
          }
          label="Allow tracking for analytics purposes"
        />
      </Container>
    </SettingsLayout>
  );
}

export { getServerSideProps } from "lib/env";
