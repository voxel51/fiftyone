import { getType } from '@fiftyone/teams-utilities';

export default function formatChanges(
  linearChangeSummary: LinearChangeSummaryType
) {
  if (getType(linearChangeSummary) !== 'Object') return null;

  return {
    add: [{ type: 'sample', count: linearChangeSummary.numSamplesAdded }],
    delete: [{ type: 'sample', count: linearChangeSummary.numSamplesDeleted }],
    update: [{ type: 'sample', count: linearChangeSummary.numSamplesChanged }]
  };
}

type LinearChangeSummaryType = {
  numSamplesAdded: number;
  numSamplesChanged: number;
  numSamplesDeleted: number;
};
