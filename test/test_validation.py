"""Tests for linked-cards template validation (Python backend)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Stub out homeassistant modules before importing the integration
sys.path.insert(0, str(Path(__file__).parent.parent))

# Create mocks for homeassistant and aiohttp
mock_hass = MagicMock()
mock_web = MagicMock()
mock_home_assistant = MagicMock()
mock_helpers = MagicMock()
mock_storage = MagicMock()

sys.modules['homeassistant'] = mock_home_assistant
sys.modules['homeassistant.components'] = MagicMock()
sys.modules['homeassistant.components.http'] = MagicMock()
sys.modules['homeassistant.config_entries'] = MagicMock()
sys.modules['homeassistant.core'] = MagicMock()
sys.modules['homeassistant.helpers'] = MagicMock()
sys.modules['homeassistant.helpers.storage'] = MagicMock()
sys.modules['aiohttp'] = MagicMock()
sys.modules['aiohttp.web'] = MagicMock()

# Now we can import the implementation
from custom_components.linked_cards import _validate_template


def test_valid_card_template():
    _validate_template({
        "card": {"type": "tile", "entity": "light.test"},
        "variables": {"area": "Living Room"}
    })


def test_valid_section_template():
    _validate_template({
        "section": {
            "title": "Room Controls",
            "cards": [{"type": "tile", "entity": "light.test"}]
        },
        "variables": {"area": "Living Room"}
    })


def test_card_and_section_both_rejected():
    try:
        _validate_template({
            "card": {"type": "tile", "entity": "light.test"},
            "section": {"title": "X", "cards": []}
        })
        assert False, "Should have raised"
    except ValueError as e:
        assert "either" in str(e).lower() or "both" in str(e).lower()


def test_neither_card_nor_section_rejected():
    try:
        _validate_template({"variables": {}})
        assert False, "Should have raised"
    except ValueError as e:
        assert "either" in str(e).lower() or "card" in str(e).lower() or "section" in str(e).lower()


def test_section_missing_cards_rejected():
    try:
        _validate_template({"section": {"title": "X"}})
        assert False, "Should have raised"
    except ValueError as e:
        assert "cards" in str(e).lower()


def test_section_missing_title_rejected():
    try:
        _validate_template({"section": {"cards": []}})
        assert False, "Should have raised"
    except ValueError as e:
        assert "title" in str(e).lower()


def test_section_cards_must_be_list():
    try:
        _validate_template({"section": {"title": "X", "cards": "not-an-array"}})
        assert False, "Should have raised"
    except ValueError as e:
        assert "cards" in str(e).lower()
