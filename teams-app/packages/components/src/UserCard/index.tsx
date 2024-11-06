import { Avatar, AvatarProps } from "@fiftyone/teams-components";
import { getInitials } from "../utils";
import { UserRole } from "@fiftyone/teams-state/src/User/__generated__/UserQuery.graphql";

export type UserCardProps = AvatarProps & {
  name: string;
  email?: string;
  src?: string;
  role?: UserRole;
  detailed?: boolean;
  compact?: boolean;
  color?: "primary" | "secondary";
};

export default function UserCard({
  name,
  email,
  role,
  src,
  detailed,
  ...props
}: UserCardProps) {
  const initial = getInitials(name?.toLocaleUpperCase() ?? "");
  return (
    <Avatar
      src={src}
      alt={name}
      title={name}
      subtitle={props.subtitle ?? email}
      detailed={detailed}
      {...props}
    >
      {initial}
    </Avatar>
  );
}
