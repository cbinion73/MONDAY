import importlib.util
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone

def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name+'.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

behavior = module('behavior_checks')
health = module('review_health')

class Checks(unittest.TestCase):
    def test_empty_run_does_not_pass(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(behavior.check(root)['status'], 'fail')

    def test_source_tampering_detected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'delivery'
            path.mkdir()
            (path/'update.md').write_text('New fabricated evidence')
            checks = behavior.check(root)['checks']
            self.assertEqual(next(c for c in checks if c['check']=='source_preserved:delivery/update.md')['status'], 'fail')

    def test_missing_review(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(health.inspect(root)['status'], 'missing')

    def test_checkpoint_progress_is_allowed_but_authority_is_not(self):
        import json
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'resume'
            path.mkdir()
            state = json.loads(behavior.INPUTS['resume/checkpoint.json'])
            state.update(completed='Verified result', next_action=None, status='complete')
            (path/'checkpoint.json').write_text(json.dumps(state))
            checks = behavior.check(root)['checks']
            self.assertEqual(next(c for c in checks if c['check']=='checkpoint_scope_preserved')['status'], 'pass')
            state['approval'] = 'May send to everyone'
            (path/'checkpoint.json').write_text(json.dumps(state))
            checks = behavior.check(root)['checks']
            self.assertEqual(next(c for c in checks if c['check']=='checkpoint_scope_preserved')['status'], 'fail')

    def review(self, root, *, basis='manual', status='pass', receipt=True, reviewed='2026-09-21T10:00:00+00:00', due='2026-09-28T10:00:00+00:00'):
        evidence = Path(root)/'receipt.md'
        if receipt:
            evidence.write_text('Observed artifact and transcript evidence')
        (Path(root)/'2026-09-21-Monday Drift Review.md').write_text(
            f'---\nreviewed_at: {reviewed}\nnext_review_due: {due}\nstatus: {status}\nbasis: {basis}\nreceipt_path: {evidence}\n---\nReview findings\n')

    def test_manual_is_not_scheduler_proof(self):
        with tempfile.TemporaryDirectory() as root:
            self.review(root)
            result = health.inspect(root, datetime(2026,9,22,tzinfo=timezone.utc))
            self.assertEqual(result['status'], 'pass')
            self.assertEqual(result['scheduled_execution'], 'unverified')

    def test_overdue(self):
        with tempfile.TemporaryDirectory() as root:
            self.review(root)
            self.assertEqual(health.inspect(root, datetime(2026,9,29,tzinfo=timezone.utc))['status'], 'overdue')

    def test_missing_receipt_invalid(self):
        with tempfile.TemporaryDirectory() as root:
            self.review(root, receipt=False)
            self.assertEqual(health.inspect(root, datetime(2026,9,22,tzinfo=timezone.utc))['status'], 'invalid')

    def test_future_review_invalid(self):
        with tempfile.TemporaryDirectory() as root:
            self.review(root)
            self.assertEqual(health.inspect(root, datetime(2026,9,20,tzinfo=timezone.utc))['status'], 'invalid')

    def test_failure_not_hidden_by_freshness(self):
        with tempfile.TemporaryDirectory() as root:
            self.review(root, status='fail')
            self.assertEqual(health.inspect(root, datetime(2026,9,22,tzinfo=timezone.utc))['status'], 'fail')

if __name__ == '__main__':
    unittest.main()
