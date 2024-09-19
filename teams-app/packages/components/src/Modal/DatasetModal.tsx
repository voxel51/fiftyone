import { useRouter } from 'next/router';
import { useCallback, useMemo } from 'react';

import {
  DatasetDescriptionInput,
  DatasetNameInput,
  TagsInput,
  Button
} from '@fiftyone/teams-components';

import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import { Theme, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { useCreateDataset } from '@fiftyone/hooks';

import { IconButton, Stack } from '@mui/material';

const style = (theme: Theme) => ({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 515,
  bgcolor: 'background.paper',
  boxShadow: theme.shadows[1],
  p: 4,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 3
});

interface Props {
  open?: boolean;
  onClose: () => void;
  visibleFields: {
    // name is always visible
    description: boolean;
    tags: boolean;
  };
  title?: string; // modal title
  actionButtonText?: string; // modal main action button text
  handleUpdated?: () => void;
  loading?: boolean;
}

export default function DatasetModal(props: Props) {
  const {
    visibleFields: { description: descriptionVisible, tags: tagsVisible },
    title,
    actionButtonText,
    handleUpdated,
    loading
  } = props;
  const theme = useTheme();
  const router = useRouter();
  const buttonText = actionButtonText || 'Create dataset';

  const {
    createDataset,
    newName,
    newDescription,
    newTags,
    SetNewName,
    SetNewDescription,
    setNewTags,
    creatingDataset,
    nameAvailable
  } = useCreateDataset();

  const handleClose = () => {
    SetNewName('');
    SetNewDescription('');
    setNewTags([]);
    props.onClose();
  };

  const modalStyle = useMemo(() => {
    return style(theme);
  }, [theme]);

  const handleOnDatasetMutate = useCallback(() => {
    if (handleUpdated) {
      handleUpdated();
      return;
    }

    // TODO:MANI: move one level higher
    createDataset({
      onComplete: (newSlug: string) => {
        props.onClose();
        if (newSlug) {
          router.push(
            {
              pathname: `/datasets/[slug]/samples`
            },
            `/datasets/${newSlug}/samples`,
            { shallow: true }
          );
        } else {
          console.error('update dataset: new slug is not defined');
        }
      }
    });
  }, [
    createDataset,
    newName,
    newDescription,
    newTags,
    SetNewName,
    SetNewDescription,
    setNewTags,
    creatingDataset,
    handleUpdated
  ]);

  const finalTitle = title || 'Create new dataset';

  return (
    <Modal
      open={props.open}
      onClose={handleClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
      data-testid="create-dataset-modal"
    >
      <Box sx={modalStyle}>
        <Box
          sx={{
            paddingBottom: 4,
            display: 'flex',
            justifyContent: 'space-between'
          }}
        >
          <Typography id="modal-modal-title" variant="h6" component="h2">
            {finalTitle}
          </Typography>
          <IconButton onClick={handleClose}>
            <CloseOutlinedIcon />
          </IconButton>
        </Box>
        <Box sx={{ pb: 2 }}>
          <DatasetNameInput
            label="Name"
            value={newName}
            onChange={(e) => SetNewName(e.target.value)}
            initialEditMode
            withDatasetUrl
          />
        </Box>
        {descriptionVisible && (
          <Box>
            <DatasetDescriptionInput
              value={newDescription}
              onChange={(e) => SetNewDescription(e.target.value)}
            />
          </Box>
        )}
        {tagsVisible && (
          <Box>
            <TagsInput
              onChange={(tags: string[]) => setNewTags(tags)}
              initialValues={[]}
            />
          </Box>
        )}
        <Box mt={4} display="flex" justifyContent="end">
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              data-testid="create-dataset-submit"
              variant="contained"
              onClick={handleOnDatasetMutate}
              disabled={
                creatingDataset || !newName || loading || !nameAvailable
              }
              loading={creatingDataset || loading}
            >
              {buttonText}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Modal>
  );
}
