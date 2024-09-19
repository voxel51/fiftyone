import { Avatar, AvatarProps } from '@fiftyone/teams-components';
import { getInitials } from '../utils';

export type UserCardProps = AvatarProps & {
  name: string;
  email?: string;
  src?: string;
  detailed?: boolean;
  compact?: boolean;
  color?: 'primary' | 'secondary';
};

export default function UserCard({
  name,
  email,
  src,
  detailed,
  ...props
}: UserCardProps) {
  const initial = getInitials(name?.toLocaleUpperCase() ?? '');
  return (
    <Avatar
      src={src}
      alt={name}
      title={name}
      subtitle={email ?? props.subtitle}
      detailed={detailed}
      {...props}
    >
      {initial}
    </Avatar>
  );
}
