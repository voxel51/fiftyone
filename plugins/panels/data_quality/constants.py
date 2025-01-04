ISSUE_TYPES = [
    "brightness",
    "blurriness",
    "aspect_ratio",
    "entropy",
    "near_duplicates",
    "exact_duplicates",
]

DEFAULT_ISSUE_CONFIG = {
    "brightness": {
        "detect_method": "threshold",  # this is actually standard dev
        "min": 0.9,
        "max": 1.0,
    },
    "blurriness": {"detect_method": "threshold", "min": 0, "max": 150},
    "aspect_ratio": {
        "detect_method": "threshold",
        "min": 0,
        "max": 0.3,
    },
    "entropy": {"detect_method": "threshold", "min": 0, "max": 4.5},
    "near_duplicates": {
        "detect_method": "threshold",
        "min": 0,
        "max": 0.15,
    },
}

DEFAULT_ISSUE_COUNTS = {
    "brightness": None,
    "blurriness": None,
    "aspect_ratio": None,
    "entropy": None,
    "near_duplicates": None,
    "exact_duplicates": None,
}

# set future dates for last scan as default
LAST_SCAN = {
    "brightness": {"timestamp": None, "dataset_size": None},
    "blurriness": {"timestamp": None, "dataset_size": None},
    "aspect_ratio": {"timestamp": None, "dataset_size": None},
    "entropy": {"timestamp": None, "dataset_size": None},
    "near_duplicates": {"timestamp": None, "dataset_size": None},
    "exact_duplicates": {"timestamp": None, "dataset_size": None},
}

# TODO: allow user to be able to use other names for the fields
FIELD_NAME = {
    "brightness": "brightness",
    "blurriness": "blurriness",
    "aspect_ratio": "aspect_ratio",
    "entropy": "entropy",
    "near_duplicates": "nearest_neighbor",
    "exact_duplicates": "filehash",
}

TITLE = {
    "brightness": "brightness",
    "blurriness": "blurriness",
    "aspect_ratio": "aspect ratio",
    "entropy": "entropy",
    "near_duplicates": "near duplicates",
    "exact_duplicates": "exact duplicates",
}

STATUS = {
    0: "Not Started",
    1: "Computing",
    2: "In Review",
    3: "Reviewed",
}

STATUS_COLOR = {
    0: "default",
    1: "#CBC3E3",
    2: "primary",
    3: "success",
}

BADGE_STATUS = {
    STATUS[0]: [[STATUS[0], STATUS_COLOR[0]]],
    STATUS[1]: [[STATUS[1], STATUS_COLOR[1]]],
    STATUS[2]: [[STATUS[2], STATUS_COLOR[2]]],
    STATUS[3]: [[STATUS[3], STATUS_COLOR[3]]],
}

DEFAULT_ISSUE_STATUS = {
    "brightness": STATUS[0],
    "blurriness": STATUS[0],
    "aspect_ratio": STATUS[0],
    "entropy": STATUS[0],
    "near_duplicates": STATUS[0],
    "exact_duplicates": STATUS[0],
}

DEFAULT_COMPUTING = {
    "brightness": {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    },
    "blurriness": {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    },
    "aspect_ratio": {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    },
    "entropy": {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    },
    "near_duplicates": {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    },
    "exact_duplicates": {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    },
}

SAMPLE_STORE = {
    "config": DEFAULT_ISSUE_CONFIG,
    "counts": DEFAULT_ISSUE_COUNTS,
    "current_counts": DEFAULT_ISSUE_COUNTS,
    "status": DEFAULT_ISSUE_STATUS,
    "computing": DEFAULT_COMPUTING,
    "last_scan": LAST_SCAN,
    "results": {
        "brightness": {
            "counts": None,
            "edges": None,
        },
        "blurriness": {
            "counts": None,
            "edges": None,
        },
        "aspect_ratio": {
            "counts": None,
            "edges": None,
        },
        "entropy": {
            "counts": None,
            "edges": None,
        },
        "near_duplicates": {
            "counts": None,
            "edges": None,
        },
        "exact_duplicates": {
            "dup_filehash": [],
            "dup_sample_ids": [],
        },
    },
}

IMAGES = {
    "brightness": "/panels/brightness.png",
    "blurriness": "/panels/blurriness.png",
    "aspect_ratio": "/panels/aspect_ratio.png",
    "entropy": "/panels/entropy.png",
    "near_duplicates": "/panels/near_dup.png",
    "exact_duplicates": "/panels/exact_dup.png",
    "unsupported_dataset": "/panels/unsupported.png",
    "vertical_line": "/panels/vertical_line.png",
    "alert": "/panels/alert.png",
    "alert_in_circle": "/panels/alert_in_circle.png",
    "data_quality": "/panels/data_quality.png",
}
