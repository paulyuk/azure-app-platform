import unittest
from pathlib import Path


class EmptySkillContractTests(unittest.TestCase):
    def test_skill_is_explicitly_unimplemented(self):
        source = (Path(__file__).parents[1] / "function_app.py").read_text()
        self.assertIn('"status":"not_implemented"', source)
        self.assertIn("__SKILL_NAME__", source)


if __name__ == "__main__":
    unittest.main()
