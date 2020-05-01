# Sample Pseudocode

```python
import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.query as foq

dataset = fod.Dataset(name="cifar100")
sample = next(dataset.iter_samples())

# samples can have arbitrary tags
sample.tags
# ['train']

sample.labels
# <fiftyone.core.label.LabelSet>

sample.labels["ground_truth_fine"]
# <fiftyone.core.label.ClassificationLabel>

print(sample.labels["ground_truth_fine"])
# {
#     "label": "mountain",
#     "confidence": null
# }

print(sample.labels["model_1_pred"])
# {
#     "label": "cattle",
#     "confidence": 0.43415618
# }


sample.insights
# <fiftyone.core.insight.InsightSet>

sample.insights["model_1_hardness"]
# <fiftyone.core.insight.HardnessInsight>

print(sample.insights["model_1_hardness"])
# {
#     "hardness": 0.98457465762,
#     "ground_truth": "ground_truth_fine"
#     "prediction": "model_1_pred"
# }


# Give me the top 10 hardest samples with GT label of 'mountain'
query = (
    foq.DatasetQuery()
    .filter({"labels.ground_truth_label.label": "mountain"})
    .sort("insights.model_1_hardness.hardness", order=foq.DESCENDING)
    .limit(10)
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
- `*_set`: a `label_set` or `insight_set` of all `*` for a single sample
