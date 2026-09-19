import random
import re
import string

COLOR_PALETTE = [
    '#FF9E64',
    '#FFB454',
    '#7FA37B',
    '#5FA88E',
    '#E8A87C',
    '#D97B5F',
    '#B98F5F',
    '#8FB89A',
]


def gen_id() -> str:
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))


def slug(text: str) -> str:
    return re.sub(r'\s+', '-', text.strip().lower())


def next_color(used_count: int) -> str:
    return COLOR_PALETTE[used_count % len(COLOR_PALETTE)]
