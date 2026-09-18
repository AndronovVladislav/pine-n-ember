import re
import sys
from pathlib import Path

MIGRATION_FILENAME_RE = re.compile(r'^(\d{4})_.*\.py$')


def next_migration_id(versions_dir: Path) -> str:
    ids = [
        int(match.group(1)) for path in versions_dir.glob('*.py') if (match := MIGRATION_FILENAME_RE.match(path.name))
    ]
    return f'{max(ids, default=0) + 1:04d}'


if __name__ == '__main__':
    versions_dir = Path(sys.argv[1])
    print(next_migration_id(versions_dir))
