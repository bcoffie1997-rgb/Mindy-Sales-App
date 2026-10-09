#!/usr/bin/env python3
"""Regenerate 02-dry-run.sql and 03-apply.sql from _dataset.sql.

The dataset has to be inlined into both files (Supabase's SQL editor has no
\\i include), and an edit applied to only one of them would make the dry run
lie about what the apply does. So the dataset lives in exactly one place and
this script splices it in.

    python3 build.py        # after ANY edit to _dataset.sql

Run it, then re-run 02 before 03.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MARK = '-- @@DATASET@@'


def build() -> int:
    dataset = io.open(os.path.join(HERE, '_dataset.sql'), encoding='utf-8').read().rstrip('\n') + '\n'
    written = []
    for tmpl, out in (('_tmpl-02-dry-run.sql', '02-dry-run.sql'),
                      ('_tmpl-03-apply.sql', '03-apply.sql')):
        text = io.open(os.path.join(HERE, tmpl), encoding='utf-8').read()
        if MARK not in text:
            print('ERROR: %s has no %s marker' % (tmpl, MARK), file=sys.stderr)
            return 1
        slots = text.count(MARK)
        text = text.replace(MARK + '\n', dataset).replace(MARK, dataset)
        io.open(os.path.join(HERE, out), 'w', encoding='utf-8').write(text)
        written.append('%s (%d dataset slots)' % (out, slots))
    print('rebuilt: ' + ', '.join(written))
    return 0


if __name__ == '__main__':
    sys.exit(build())
