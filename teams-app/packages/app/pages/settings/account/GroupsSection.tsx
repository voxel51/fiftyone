import { useCurrentUser } from '@fiftyone/hooks';
import { Container, SectionHeader } from '@fiftyone/teams-components';
import { Group } from '@fiftyone/teams-state';
import { Chip, Stack } from '@mui/material';
import { useRouter } from 'next/router';

interface GroupProps {
  groups: Group[];
}

const GroupsSection: React.FC<GroupProps> = ({ groups }) => {
  const [currentUser] = useCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const router = useRouter();

  if (!groups.length) {
    return null;
  }

  return (
    <Container>
      <SectionHeader title="Groups" />
      <Stack direction="row" spacing={1} flexWrap="wrap" paddingBottom={2}>
        {groups.map((group, index) => (
          <Chip
            key={index}
            label={group.name}
            variant="outlined"
            sx={isAdmin ? { cursor: 'pointer' } : {}}
            onClick={() => {
              if (isAdmin) {
                router.push(`/settings/team/groups/${group.slug}`);
              }
            }}
          />
        ))}
      </Stack>
    </Container>
  );
};

export default GroupsSection;
