# Sample Pseudocode

```python
import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.query as foq

dataset = fod.Dataset(name="cifar100")
sample = next(dataset.iter_samples())

###############################################################################
# TAGS
###############################################################################

# samples can have arbitrary tags
sample.tags
# ['train']

###############################################################################
# LABELS
###############################################################################

sample.labels
# <fiftyone.core.label.LabelSet>

sample.labels["ground_truth_fine"]
# <fiftyone.core.label.ClassificationLabel>

print(sample.labels["ground_truth_fine"])
# {
#     "label": "mountain",
#     "confidence": null
# }

sample.labels["ground_truth_fine"].group
# "ground_truth_fine"

print(sample.labels["model_1_pred"])
# {
#     "label": "cattle",
#     "confidence": 0.43415618
# }

###############################################################################
# INSIGHTS
###############################################################################

sample.insights
# <fiftyone.core.insight.InsightSet>

sample.insights["model_1_hardness"]
# <fiftyone.core.insight.HardnessInsight>

sample.insights["model_1_hardness"].group
# "model_1_hardness"

print(sample.insights["model_1_hardness"])
# {
#     "hardness": 0.98457465762,
#     "ground_truth": "ground_truth_fine"
#     "prediction": "model_1_pred"
# }

###############################################################################
# TAGS/GROUPS ON DATASETS
###############################################################################

dataset.get_tags()
# ["train", "test"]

dataset.get_label_groups()
# ["ground_truth_fine", "ground_truth_coarse", "model_1_pred", "model_2_pred"]

dataset.get_insight_groups()
# ["file_hash", "model_1_hardness", "model_2_hardness"]

###############################################################################
# QUERIES
###############################################################################

# Give me the top 10 hardest samples with GT label of 'mountain'
query = (
    foq.DatasetQuery()
    .filter({"labels.ground_truth_label.label": "mountain"})
    .sort("insights.model_1_hardness.hardness", order=foq.DESCENDING)
    .limit(10)
)

# Give me 5 random samples that have "model_1_pred" label on them
query = (
    foq.DatasetQuery()
    .filter({"labels": "model_1_pred"})
    .sample(5)
)

# iterate the query
for query_idx, sample in query.iter_samples(dataset):
    ...

# browse the images
fo.launch_dashboard(dataset=dataset, query=query)
```

## Names up for debate:

- `tag`: sample splits (or groupings because they could intersect)
  `[train, test, validation, etc.]`
- `insight`: `feature`, `attribute`, etc.
- `*_group`: a `label_group` or `insight_group`, the group that spans across
  samples, e.g.
  `label_groups = [ground_truth, model_1_preds, ...]`
  `insight_groups = [file_hash, hardness_1, hardness_2, ...]`
- `*Set`: a `sample.labels`/`sample.insights` returns a `LabelSet`/`InsightSet`
  of all `Label`/`Insight`s for a single sample
