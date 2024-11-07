import { Avatar, AvatarProps } from "@fiftyone/teams-components";
import { getInitials } from "../utils";
import { UserRole } from "@fiftyone/teams-state/src/User/__generated__/UserQuery.graphql";
import MailOutlineIcon from "@mui/icons-material/MailOutline";

export type UserCardProps = AvatarProps & {
  id?: string;
  name: string;
  email?: string;
  src?: string;
  role?: UserRole;
  detailed?: boolean;
  compact?: boolean;
  color?: "primary" | "secondary";
};

export default function UserCard({
  id,
  name,
  email,
  role,
  src,
  detailed,
  ...props
}: UserCardProps) {
  const initial = getInitials(id ? name?.toLocaleUpperCase() : "");
  return (
    <Avatar
      src={src}
      alt={name}
      title={name}
      subtitle={props.subtitle ?? email}
      detailed={detailed}
      {...props}
    >
      {initial ? initial : <MailOutlineIcon />}
    </Avatar>
  );
}
