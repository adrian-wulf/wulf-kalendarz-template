"""Limit logu kiosku (kiosk.sh → rotate_log): python3 -m unittest discover -s app/kiosk -p 'test_*.py'"""
import os
import subprocess
import tempfile
import unittest

KIOSK_SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kiosk.sh')


def rotate(log, max_kb):
    env = dict(os.environ, KIOSK_NO_LOG='1', KIOSK_ROTATE_ONLY='1', KIOSK_LOG=log, KIOSK_LOG_MAX_KB=str(max_kb))
    subprocess.run(['bash', '-c', '. "$0"; rotate_log', KIOSK_SH], env=env, check=True, timeout=10)


class KioskLog(unittest.TestCase):
    def test_duzy_log_idzie_do_kopii(self):
        with tempfile.TemporaryDirectory() as d:
            log = os.path.join(d, 'kiosk.log')
            with open(log, 'wb') as f:
                f.write(b'x' * 20_000)
            rotate(log, 10)
            self.assertEqual(os.path.getsize(log), 0)
            self.assertEqual(os.path.getsize(log + '.1'), 20_000)

    def test_maly_log_zostaje(self):
        with tempfile.TemporaryDirectory() as d:
            log = os.path.join(d, 'kiosk.log')
            with open(log, 'wb') as f:
                f.write(b'x' * 2_000)
            rotate(log, 10)
            self.assertEqual(os.path.getsize(log), 2_000)
            self.assertFalse(os.path.exists(log + '.1'))


if __name__ == '__main__':
    unittest.main()
