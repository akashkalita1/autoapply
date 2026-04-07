import json


def load_json(filepath):
    with open(filepath, "r") as f:
        return json.load(f)


def save_json(data, filepath):
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
