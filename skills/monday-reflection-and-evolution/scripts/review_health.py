#!/usr/bin/env python3
"""Read-only freshness check for governed Monday drift review notes."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

def parse_time(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timestamp must include a timezone')
    return parsed

def inspect(directory, now=None):
    now = now or datetime.now(timezone.utc)
    candidates, invalid = [], []
    for path in Path(directory).glob('*-Monday Drift Review.md'):
        try:
            text = path.read_text()
            if not text.startswith('---\n'):
                raise ValueError('Missing review metadata')
            header = text.split('---', 2)[1]
            fields = dict(line.split(': ', 1) for line in header.splitlines() if ': ' in line)
            reviewed = parse_time(fields['reviewed_at'])
            due = parse_time(fields['next_review_due'])
            if reviewed > now + timedelta(minutes=5) or due <= reviewed or due > reviewed + timedelta(days=8):
                raise ValueError('Invalid review window')
            if fields.get('status') not in {'pass','fail','partial'}:
                raise ValueError('Unknown review status')
            if fields.get('basis') not in {'manual','scheduled'}:
                raise ValueError('Unknown execution basis')
            receipt = Path(fields['receipt_path'])
            if not receipt.is_absolute() or not receipt.is_file():
                raise ValueError('Missing verification receipt')
            if not text.split('---',2)[2].strip():
                raise ValueError('Empty review')
            candidates.append((reviewed, due, path, fields))
        except (ValueError, KeyError, OSError) as exc:
            invalid.append({'path': str(path), 'error':str(exc)})
    if not candidates:
        return {'status':'missing' if not invalid else 'invalid', 'invalid':invalid,
                'scheduled_execution':'unverified', 'action':'Locate run evidence or perform a labeled manual recovery review; never report green.'}
    reviewed, due, path, fields = max(candidates, key=lambda item:item[0])
    status = 'overdue' if now > due else fields['status']
    if invalid and status == 'pass':
        status = 'partial'
    scheduled = [c for c in candidates if c[3]['basis']=='scheduled']
    return {'status':status, 'review':str(path), 'reviewed_at':reviewed.isoformat(),
            'next_review_due':due.isoformat(), 'invalid':invalid,
            'scheduled_execution':'observed' if scheduled else 'unverified',
            'last_scheduled_review_at':max(c[0] for c in scheduled).isoformat() if scheduled else None,
            'note':'Metadata freshness only; the reviewer must inspect the receipt and actual run/artifact evidence.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--as-of')
    args = parser.parse_args()
    result = inspect(args.directory, parse_time(args.as_of) if args.as_of else None)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['status']=='pass' else 1)

if __name__ == '__main__':
    main()
