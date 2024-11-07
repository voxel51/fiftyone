import { Avatar, AvatarProps } from "@fiftyone/teams-components";
import { getInitials } from "../utils";
import MailOutlineIcon from "@mui/icons-material/MailOutline";

export type UserCardProps = AvatarProps & {
  id?: string;
  name: string;
  email?: string;
  src?: string;
  detailed?: boolean;
  compact?: boolean;
  color?: "primary" | "secondary";
};

export default function UserCard({
  id,
  name,
  email,
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
      subtitle={email ?? props.subtitle}
      detailed={detailed}
      {...props}
    >
      {initial ? initial : <MailOutlineIcon />}
    </Avatar>
  );
}
