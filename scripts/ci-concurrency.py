from pathlib import Path
from threading import Event, Thread
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'inference'))
from model_runtime.concurrency import InferenceSlots, InferenceBusy


class SlotChecks(unittest.TestCase):
    def test_running_worker_holds_slot_until_it_returns(self):
        slots = InferenceSlots(1)
        started, finish = Event(), Event()
        def operation():
            started.set()
            finish.wait(3)
        thread = Thread(target=lambda: slots.run(operation))
        thread.start()
        try:
            self.assertTrue(started.wait(1))
            with self.assertRaises(InferenceBusy):
                slots.run(lambda: None)
        finally:
            finish.set()
            thread.join(4)
        self.assertEqual(slots.run(lambda: 7), 7)

    def test_failed_operation_releases_slot(self):
        slots = InferenceSlots(1)
        with self.assertRaises(ValueError):
            slots.run(lambda: int('invalid'))
        self.assertEqual(slots.run(lambda: 7), 7)


if __name__ == '__main__':
    unittest.main(verbosity=2)
