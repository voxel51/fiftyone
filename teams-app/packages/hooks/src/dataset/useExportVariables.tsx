import { useCurrentFilters, useExportView } from '@fiftyone/hooks';
import { exportMode, exportType } from '@fiftyone/teams-state';
import { useRouter } from 'next/router';
import { useRecoilValue } from 'recoil';

export function useExportVariables(estimate?: boolean) {
  const router = useRouter();
  const mode = useRecoilValue(exportMode);
  const { view = [], form = {} } = useCurrentFilters();
  const { data, format, field, hasLabels, path } = useExportView();
  const { slug, snapshot } = router.query;
  const { filters = {}, sampleIds = [] } = form;
  const type = useRecoilValue(exportType);
  const viewSelectors =
    type === 'view'
      ? { viewStages: view, filters, sampleIds }
      : { viewStages: [], filters: {}, sampleIds: [] };
  const variables: any = {
    datasetIdentifier: slug as string,
    snapshot: snapshot as string
  };
  const includeFilepaths = data?.includes('filepaths');
  const includeTags = data?.includes('tags');

  // common variables for estimate and export mutation
  variables.includeMedia = data?.includes('media');
  if (estimate) {
    variables.viewSelectors = viewSelectors;
  } else {
    variables.exportViewSelectors = viewSelectors;
  }
  if (estimate && (field || includeFilepaths || includeTags)) {
    const fieldsForEstimate = [];
    if (field) {
      const fieldAsArray = Array.isArray(field) ? field : [field];
      fieldsForEstimate.push(...fieldAsArray);
    }
    if (includeFilepaths) fieldsForEstimate.push('filepath');
    if (includeTags) fieldsForEstimate.push('tags');
    variables.fields = fieldsForEstimate;
  }
  if (estimate) return variables;

  // variables unique to direct export mutation
  variables.includeFilepaths = includeFilepaths;
  variables.includeTags = includeTags;
  if (hasLabels) {
    variables.includeLabels = { format };
    if (Array.isArray(field)) {
      variables.includeLabels.fields = field;
    } else if (field) {
      variables.includeLabels.labelField = field;
    }
  }

  // variables unique to cloud export mutation
  if (mode === 'cloud') {
    variables.cloudStoragePath = path;
  }

  return variables;
}
