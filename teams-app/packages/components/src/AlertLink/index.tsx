import { USER_TEAM_PATH } from '@fiftyone/teams-state/src/Settings/team';
import { SALES_CONTACT } from '@fiftyone/teams-state/src/constants';
import { Link } from '@mui/material';

const AlertLink: React.FC<{ code: string; details: string[] }> = ({
  code,
  details
}) => {
  switch (code) {
    case 'LICENSE_EXPIRATION':
      return (
        <span>
          Contact your Voxel51 Customer Success Representative to{' '}
          <Link href={SALES_CONTACT}>resolve this</Link>.
        </span>
      );
    case 'STRICT_COMPLIANCE':
      return (
        <span>
          Please{' '}
          <Link href={USER_TEAM_PATH} target="_blank">
            resolve this
          </Link>{' '}
          before {details[0]} to avoid any service interruptions.
        </span>
      );

    default:
      return <></>;
  }
};

export default AlertLink;
