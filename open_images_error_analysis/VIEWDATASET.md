Using the dataset JSON to quickly get exploring:

```python
import fiftyone as fo
from fiftyone import ViewField as F

dataset = fo.load_dataset("open-images-v4-test-500")
# dataset = fo.Dataset.from_json("open-images-v4-test-500.json")

# Filter the visible detections by confidence
view = (
    dataset
    .exclude_fields("faster_rcnn")
    .filter_detections("true_positives", F("confidence") > 0.4)
    .filter_detections("false_positives", F("confidence") > 0.4)
    .match(F("false_positives.detections").length() > 0)
    .sort_by("open_images_id")
)

session = fo.launch_app(view=view)
```
