from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from .const import DOMAIN


class LinkedCardsConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for Linked Cards."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Linked Cards", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
