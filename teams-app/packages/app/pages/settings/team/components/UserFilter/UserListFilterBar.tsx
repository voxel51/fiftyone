import Box from "@mui/material/Box";
import UserSort from "./UserSort";
import UserSearchBar from "./UserSearchBar";
import LicenseAudit from "../../users/components/LicenseAudit";

export default function UserListFilterBar() {
  return (
    <>
      <Box display="flex" justifyContent="space-between" paddingBottom={2}>
        <UserSearchBar />
        <UserSort />
      </Box>
      <LicenseAudit showComplianceWarning />
    </>
  );
}
