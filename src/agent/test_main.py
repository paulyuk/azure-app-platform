import unittest
from unittest.mock import MagicMock, patch

from agent_framework import ChatResponse, Content, Message, ResponseStream, UsageDetails
from agent_framework.openai import OpenAIChatClient

from main import BufferedGatewayChatClient, _local_skill_tools
from local_ports import agent_listen_port, agent_port_override, local_skill_ports


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


class LocalPortTests(unittest.TestCase):
    def test_local_ports_default_to_the_dealer_profile(self):
        with patch.dict(
            "os.environ",
            {
                "AGENT_PORT": "",
                "PORT": "",
                "INVENTORY_SEARCH_PORT": "",
                "TRADE_IN_VALUE_PORT": "",
                "RATE_SHEET_PORT": "",
                "DEAL_DOC_PORT": "",
            },
            clear=True,
        ):
            self.assertIsNone(agent_port_override())
            self.assertEqual(agent_listen_port(), 8088)
            self.assertEqual(
                local_skill_ports(),
                {
                    "inventory-search": 7071,
                    "trade-in-value": 7072,
                    "rate-sheet": 7073,
                    "deal-doc": 7074,
                },
            )

    def test_local_ports_honor_valid_overrides(self):
        with patch.dict(
            "os.environ",
            {
                "AGENT_PORT": "18088",
                "INVENTORY_SEARCH_PORT": "17071",
                "TRADE_IN_VALUE_PORT": "17072",
                "RATE_SHEET_PORT": "17073",
                "DEAL_DOC_PORT": "17074",
            },
            clear=True,
        ):
            self.assertEqual(agent_port_override(), 18088)
            self.assertEqual(agent_listen_port(), 18088)
            self.assertEqual(
                local_skill_ports(),
                {
                    "inventory-search": 17071,
                    "trade-in-value": 17072,
                    "rate-sheet": 17073,
                    "deal-doc": 17074,
                },
            )

    def test_local_skill_tools_use_all_custom_mcp_urls(self):
        ports = {
            "inventory-search": 17071,
            "trade-in-value": 17072,
            "rate-sheet": 17073,
            "deal-doc": 17074,
        }
        with (
            patch("main.LOCAL_SKILL_PORTS", ports),
            patch(
                "agent_framework.MCPStreamableHTTPTool",
                side_effect=lambda **kwargs: kwargs,
            ),
        ):
            tools = _local_skill_tools()

        self.assertEqual(
            tools,
            [
                {
                    "name": name,
                    "url": f"http://localhost:{port}/runtime/webhooks/mcp",
                }
                for name, port in ports.items()
            ],
        )

    def test_standard_host_port_remains_available_without_agent_override(self):
        with patch.dict("os.environ", {"PORT": "19088"}, clear=True):
            self.assertIsNone(agent_port_override())
            self.assertEqual(agent_listen_port(), 19088)

    def test_local_ports_reject_invalid_or_duplicate_values(self):
        with patch.dict("os.environ", {"AGENT_PORT": "not-a-port"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "AGENT_PORT"):
                agent_port_override()
        with patch.dict(
            "os.environ",
            {
                "INVENTORY_SEARCH_PORT": "17071",
                "TRADE_IN_VALUE_PORT": "17071",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "must be unique"):
                local_skill_ports()

    @patch("main.agent_port_override", return_value=18088)
    @patch("main.agent_listen_port", return_value=18088)
    @patch("main.build_agent", return_value=object())
    @patch("main._gateway_settings", return_value=("https://gateway.example", "secret"))
    @patch("main.ResponsesHostServer")
    def test_main_passes_agent_port_override_to_host(
        self,
        server_type,
        _gateway_settings,
        build_agent,
        _listen_port,
        _port_override,
    ):
        server = MagicMock()
        server_type.return_value = server

        import main

        main.main()

        build_agent.assert_called_once_with()
        server_type.assert_called_once()
        server.run.assert_called_once_with(port=18088)

    @patch("main.agent_port_override", return_value=None)
    @patch("main.agent_listen_port", return_value=19088)
    @patch("main.build_agent", return_value=object())
    @patch("main._gateway_settings", return_value=("https://gateway.example", "secret"))
    @patch("main.ResponsesHostServer", autospec=True)
    def test_main_preserves_sdk_port_resolution_without_agent_override(
        self,
        server_type,
        _gateway_settings,
        build_agent,
        _listen_port,
        _port_override,
    ):
        server = MagicMock()
        server_type.return_value = server

        import main

        main.main()

        build_agent.assert_called_once_with()
        server_type.assert_called_once()
        server.run.assert_called_once_with(port=None)


if __name__ == "__main__":
    unittest.main()
