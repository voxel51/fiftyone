# Interface V2

This docs assess existing interfaces relevant to fiftyone and/or familiar to
data scientists in order inspire the fiftyone interface design.

Separate files for each package are similar to "10 minutes to <X>" tutorials.

Existing Interfaces:

1. python primitives (`list`, `dict`)
2. `pandas`
3. MongoDB (`pymongo`)
4. MongoEngine (`mongoengine`)

Objects to consider:

-   `Dataset`
-   `Sample`
-   `DatasetView`
-   `Label`
-   `Insight`

## python primitives (`dict`)

```python
d = {}

for sample_id in d:
    ...
for sample in d.values():
    ...
for sample_id, sample in d.items():
    ...
```

##

Tyler Ganter, tyler@voxel51.com
