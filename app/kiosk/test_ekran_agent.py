"""Testy agenta ekranu (bez sprzętu): python3 -m unittest discover -s app/kiosk -p 'test_*.py'"""
import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location('ekran_agent', os.path.join(os.path.dirname(__file__), 'ekran-agent.py'))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class LevelsFrom(unittest.TestCase):
    def test_stara_aplikacja_bez_jasnosci(self):
        levels, wake = agent.levels_from({'phase': 'night', 'rotation': 0})
        self.assertEqual(levels, {'day': 1.0, 'evening': 0.55, 'night': 0.0})
        self.assertEqual(wake, 0.4)

    def test_brak_odpowiedzi(self):
        self.assertEqual(agent.levels_from(None), (agent.LEVELS, agent.WAKE_LEVEL))
        self.assertEqual(agent.phase_of(None), 'day')
        self.assertEqual(agent.phase_of({'phase': 'xyz'}), 'day')

    def test_jasnosc_z_panelu(self):
        levels, wake = agent.levels_from({'phase': 'day', 'brightness': {'day': 80, 'evening': 30, 'night': 0, 'wake': 25}})
        self.assertEqual(levels, {'day': 0.8, 'evening': 0.3, 'night': 0.0})
        self.assertEqual(wake, 0.25)

    def test_zle_wartosci_i_przyciemniona_noc(self):
        levels, wake = agent.levels_from({'brightness': {'day': 'x', 'evening': 150, 'night': 20, 'wake': 10}})
        self.assertEqual(levels, {'day': 1.0, 'evening': 1.0, 'night': 0.2})
        self.assertEqual(wake, 0.2)  # nie ciemniej niż noc


if __name__ == '__main__':
    unittest.main()
