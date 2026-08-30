import unittest
from unittest.mock import patch

from agent_framework import ChatResponse, Content, Message, ResponseStream, UsageDetails
from agent_framework.openai import OpenAIChatClient

from main import BufferedGatewayChatClient


class BufferedGatewayChatClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_streaming_request_uses_non_streaming_gateway_response(self):
        response = ChatResponse(
            messages=[
                Message("assistant", [Content.from_text("Hello from the gateway.")]),
            ],
            response_id="response-1",
            model="gpt-latest",
            finish_reason="stop",
            usage_details=UsageDetails(
                input_token_count=10,
                output_token_count=2,
                total_token_count=12,
            ),
        )

        async def fake_get_response(_self, _messages, *, stream=False, **_kwargs):
            self.assertFalse(stream)
            return response

        client = object.__new__(BufferedGatewayChatClient)
        with patch.object(OpenAIChatClient, "get_response", fake_get_response):
            stream = client.get_response(
                [Message("user", [Content.from_text("Hello")])],
                stream=True,
            )
            self.assertIsInstance(stream, ResponseStream)
            updates = [update async for update in stream]
            final = await stream.get_final_response()

        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0].text, "Hello from the gateway.")
        self.assertEqual(final.text, "Hello from the gateway.")
        self.assertEqual(final.response_id, "response-1")
        self.assertEqual(final.model, "gpt-latest")
        self.assertEqual(final.usage_details["input_token_count"], 10)
        self.assertEqual(final.usage_details["output_token_count"], 2)


if __name__ == "__main__":
    unittest.main()
