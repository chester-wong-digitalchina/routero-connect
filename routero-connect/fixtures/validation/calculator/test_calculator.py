import unittest

from calculator import add, multiply


class CalculatorTests(unittest.TestCase):
    def test_addition(self):
        self.assertEqual(add(2, 3), 5)

    def test_multiplication(self):
        self.assertEqual(multiply(-2, 3), -6)


if __name__ == "__main__":
    unittest.main()
