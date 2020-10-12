import os

os.environ["FIFTYONE_DISABLE_SERVICES"] = "1"

from fiftyone import config
from fiftyone.constants import FIFTYONE_CONFIG_PATH

config.show_progress_bars = False
config.write_json(FIFTYONE_CONFIG_PATH)
