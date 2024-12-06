import { useSecurityRole, withPermissions } from "@fiftyone/hooks";
import { roleOrder } from "@fiftyone/hooks/src/permission/useSecurityRole";
import {
  Box,
  SectionHeader,
  SettingsLayout,
  TableContainer,
  TableSkeleton,
} from "@fiftyone/teams-components";
import { mainTitleSelector, MANAGE_ORGANIZATION } from "@fiftyone/teams-state";
import { LEARN_MORE_ABOUT_ROLES_LINK } from "@fiftyone/teams-state/src/constants";
import CheckIcon from "@mui/icons-material/Check";
import ClearIcon from "@mui/icons-material/Clear";
import {
  Card,
  CardContent,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect } from "react";
import { useSetRecoilState } from "recoil";

function SecurityRoles() {
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings | Security | Roles");
  }, []);

  const { byUserAction } = useSecurityRole();

  const renderHeaderCell = (data) => {
    const { attribute, display, description } = data;

    if (attribute === "DATASET_ACCESS_LEVEL") {
      return (
        <TableCell key={`${attribute}-info`}>
          <Card sx={{ minWidth: 150, boxShadow: "none" }}>
            <CardContent>
              <Typography variant="h6" component="div" data-testid="title">
                {display}
              </Typography>
              <Typography sx={{ mb: 1.5 }} color="text.secondary">
                <br />
                <Typography component="span" color="text.primary">
                  EXPLICIT
                </Typography>
                : These users have access any datasets to which they (or a group
                to which they belong) have been granted{" "}
                <Link
                  href={LEARN_MORE_ABOUT_ROLES_LINK + "#teams-specific-access"}
                  target="_blank"
                >
                  <span
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                  >
                    specific access
                  </span>
                </Link>
                <br />
                <Typography component="span" color="text.primary">
                  IMPLICIT
                </Typography>
                : These users can be granted explicit access to datasets. In
                addition, they receive the dataset's{" "}
                <Link
                  href={LEARN_MORE_ABOUT_ROLES_LINK + "#default-access"}
                  target="_blank"
                >
                  <span
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                  >
                    default access
                  </span>
                </Link>
                , if one is configured
                <br />
                <Typography component="span" color="text.primary">
                  ALL
                </Typography>
                : These users have Can Manage permissions on all datasets
              </Typography>
            </CardContent>
          </Card>
        </TableCell>
      );
    }

    return (
      <TableCell key={`${attribute}-info`}>
        <Card sx={{ minWidth: 150, boxShadow: "none" }}>
          <CardContent>
            <Typography variant="h6" component="div" data-testid="title">
              {display}
            </Typography>
            <Typography
              sx={{ mb: 1.5 }}
              variant="subtitle1"
              color="text.secondary"
              style={{ whiteSpace: "pre-line" }}
            >
              {description}
            </Typography>
          </CardContent>
        </Card>
      </TableCell>
    );
  };

  const renderAttributeRow = (data, idx: number) => {
    return (
      <TableRow key={"attribute-" + idx}>
        {renderHeaderCell(data[0])}
        {data.map((roleData, roleIdx: number) => (
          <TableCell key={`role-${roleIdx}`}>
            {typeof roleData.boolValue === "boolean" ? (
              roleData.boolValue ? (
                <CheckIcon sx={{ color: "green" }} />
              ) : (
                <ClearIcon color="error" />
              )
            ) : (
              roleData.permissionValue || roleData.accessLevelValue
            )}
          </TableCell>
        ))}
      </TableRow>
    );
  };

  return (
    <SettingsLayout>
      <Box data-testid="security-roles">
        <SectionHeader
          containerProps={{ "data-testid": "security-roles-header" }}
          title={`Roles`}
          description="Detailed access to actions of different roles in the organization"
          learnMoreLink={LEARN_MORE_ABOUT_ROLES_LINK}
          learnMoreText="Learn more about roles and permissions"
        ></SectionHeader>
        <Box>
          <Paper sx={{ width: "100%", overflow: "hidden" }}>
            <TableContainer sx={{ maxHeight: "500px" }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Attribute</TableCell>
                    {roleOrder.map((role) => (
                      <TableCell key={role}>{role}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody data-testid="table-body">
                  {!byUserAction ? (
                    <TableSkeleton rows={10} />
                  ) : (
                    byUserAction.map((attributeList, idx: number) =>
                      renderAttributeRow(attributeList, idx)
                    )
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      </Box>
    </SettingsLayout>
  );
}

export default withPermissions(SecurityRoles, [MANAGE_ORGANIZATION], "user", {
  getLayoutProps: () => ({ topNavProps: { noBorder: true } }),
});

export { getServerSideProps } from "lib/env";
