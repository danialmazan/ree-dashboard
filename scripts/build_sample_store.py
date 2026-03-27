from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.sample_store import STORE_PATH, build_store


def main() -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(__import__("json").dumps(build_store(), indent=2), encoding="utf-8")
    print(f"Wrote sample store to {STORE_PATH}")


if __name__ == "__main__":
    main()
