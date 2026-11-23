import unittest

import local_model_server as server


class CriteriaModelBudgetTest(unittest.TestCase):
    def exercise(self, responses, increments):
        now = 0
        requests = []

        def post(url, body, *, timeout):
            nonlocal now
            requests.append((body, timeout))
            now += increments[len(requests) - 1]
            return responses[len(requests) - 1]

        return server.deadline_post(server.CRITERIA_STEP_TIMEOUT, post, clock=lambda: now), requests

    def test_format_repair_shares_budget_and_does_not_regenerate(self):
        malformed = {"message": {"content": "{broken"}}
        post, requests = self.exercise([malformed, malformed], [100, 100])
        original = [{"role": "user", "content": "Review question"}]
        attempts = []
        with self.assertRaisesRegex(ValueError, "unreadable after format repair"):
            server.chat("", "model", original, post=post, attempts=attempts, criteria=True)
        self.assertEqual([timeout for _, timeout in requests], [240, 140])
        self.assertTrue(all(body["options"]["num_predict"] == server.CRITERIA_PREDICT
                            for body, _ in requests))
        self.assertEqual(requests[1][0]["messages"][-1]["content"], "{broken")
        self.assertEqual(attempts, ["invalid", "model-repair-failed"])

    def test_cut_off_reply_is_regenerated_from_the_original_question(self):
        truncated = {"done_reason": "length", "message": {"content": "{unfinished"}}
        complete = {"message": {"content": '{"questions":[]}'}}
        post, requests = self.exercise([truncated, complete], [32, 32])
        source = [{"role": "user", "content": "Review question"}]
        self.assertEqual(server.chat("", "model", source, post=post, criteria=True), complete)
        self.assertEqual(requests[1][0]["messages"], source)
        self.assertEqual(requests[1][1], 208)

    def test_a_recovery_is_not_started_after_the_deadline(self):
        post, requests = self.exercise([{"message": {"content": ""}}], [240])
        with self.assertRaises(TimeoutError):
            server.chat("", "model", [], post=post, criteria=True)
        self.assertEqual(len(requests), 1)
