"""Tests for the 9-step demo headless runner."""
from demo.demo import DemoRunner
from api.app.core.runtime import store

def test_demo_runner_all_9_steps():
    runner = DemoRunner(pause=False, until_step=9)
    success = runner.run()
    assert success is True

def test_demo_runner_partial_until():
    runner = DemoRunner(pause=False, until_step=4)
    success = runner.run()
    assert success is True
    # At step 4, job was created and checked in but not yet completed
    s = store.read()
    assert 'J-2231' in s.jobs
    assert s.jobs['J-2231']['technician_id'] == 'priya'
