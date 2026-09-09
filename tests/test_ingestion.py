import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    path = ROOT / "scripts" / name
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IngestionTests(unittest.TestCase):
    def test_flatten_redata_preserves_source_values(self):
        module = load_script("ingest_sources.py")
        payload = {"included": [{"type": "Eólica", "attributes": {"title": "Eólica", "values": [
            {"datetime": "2025-01-01T00:00:00+01:00", "value": 1000, "percentage": 0.25}
        ]}}]}
        self.assertEqual(module.flatten_redata(payload, 0.001), [
            {"period": "2025-01", "series": "Eólica", "value": 1.0, "share": 25.0}
        ])

    def test_validator_rejects_post_cutoff_marginal_classification(self):
        module = load_script("validate_data.py")
        payload = {"schema_version": 1, "generation": [{"period": "2019-01", "series": "Eólica", "value": 1}], "hourly": {"status": "unavailable", "years": []}, "marginal_technology": {"cutoff": "2025-03-18T23:00:00+01:00", "rows": [{"timestamp": "2025-03-19T00:00:00+01:00"}]}}
        self.assertIn("marginal technology extends beyond source cutoff", module.validate(payload))


if __name__ == "__main__":
    unittest.main()
