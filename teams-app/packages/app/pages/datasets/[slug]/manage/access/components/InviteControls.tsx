import {
  manageDatasetGrantGroupAccessOpenState,
  manageDatasetGrantUserAccessOpenState,
} from "@fiftyone/teams-state";
import { GroupAdd, PersonAddAlt } from "@mui/icons-material";
import { Button } from "@mui/material";
import { useSetRecoilState } from "recoil";

const InviteControls = () => {
  const setManageDatasetGrantUserAccessOpenState = useSetRecoilState(
    manageDatasetGrantUserAccessOpenState
  );
  const setManageDatasetGrantGroupAccessOpenState = useSetRecoilState(
    manageDatasetGrantGroupAccessOpenState
  );
  return (
    <>
      <Button
        data-testid="dataset-access-add-user-btn"
        startIcon={<PersonAddAlt />}
        onClick={() => {
          setManageDatasetGrantUserAccessOpenState(true);
        }}
        variant="outlined"
      >
        Add User
      </Button>
      <Button
        startIcon={<GroupAdd />}
        onClick={() => {
          setManageDatasetGrantGroupAccessOpenState(true);
        }}
        sx={{ marginLeft: 1 }}
        variant="outlined"
      >
        Add Group
      </Button>
    </>
  );
};

export default InviteControls;
