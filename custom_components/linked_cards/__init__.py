from __future__ import annotations

from pathlib import Path
import json
import re
from typing import Any

from aiohttp import web

from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, EVENT_TEMPLATE_UPDATED, STATIC_URL, STORAGE_KEY, STORAGE_VERSION

_TEMPLATE_ID_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,80}$")
_MAX_TEMPLATES = 200
_MAX_TEMPLATE_BYTES = 100_000
_MAX_TEMPLATE_DEPTH = 30


def _valid_template_id(template_id: str) -> bool:
    return bool(isinstance(template_id, str) and _TEMPLATE_ID_RE.fullmatch(template_id))


def _depth(value: Any, current: int = 0) -> int:
    if current > _MAX_TEMPLATE_DEPTH:
        return current
    if isinstance(value, dict):
        if not value:
            return current + 1
        return max(_depth(child, current + 1) for child in value.values())
    if isinstance(value, list):
        if not value:
            return current + 1
        return max(_depth(child, current + 1) for child in value)
    return current


def _validate_template(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Template payload must be a JSON object")
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    if len(encoded) > _MAX_TEMPLATE_BYTES:
        raise ValueError(f"Template payload is too large; limit is {_MAX_TEMPLATE_BYTES} bytes")
    if _depth(payload) > _MAX_TEMPLATE_DEPTH:
        raise ValueError(f"Template payload is too deeply nested; limit is {_MAX_TEMPLATE_DEPTH}")
    card = payload.get("card")
    section = payload.get("section")
    if card is not None and section is not None:
        raise ValueError("Template must contain either a 'card' or a 'section', not both")
    if card is None and section is None:
        raise ValueError("Template must contain either a 'card' or a 'section'")
    if card is not None:
        if not isinstance(card, dict):
            raise ValueError("Template card must be an object")
        if not isinstance(card.get("type"), str) or not card["type"]:
            raise ValueError("Template card must contain a string type")
    if section is not None:
        if not isinstance(section, dict):
            raise ValueError("Template section must be an object")
        if not isinstance(section.get("cards"), list):
            raise ValueError("Template section must contain a 'cards' array")
        if not isinstance(section.get("title"), str):
            raise ValueError("Template section must contain a 'title' string")
    variables = payload.get("variables", {})
    if variables is not None and not isinstance(variables, dict):
        raise ValueError("Template variables must be an object")


def _is_admin(request: web.Request) -> bool:
    user = request.get("hass_user")
    return bool(user and getattr(user, "is_admin", False))


def _admin_required() -> web.Response:
    return web.json_response({"message": "Administrator privileges are required"}, status=403)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    if DOMAIN in config:
        await _async_setup_once(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await _async_setup_once(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Clean up when removing the integration."""
    hass.data.pop(DOMAIN, None)
    return True


async def _async_setup_once(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("loaded"):
        return

    store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {"templates": {}}
    data.setdefault("templates", {})
    hass.data[DOMAIN] = {"store": store, "data": data, "loaded": True}

    www_path = Path(__file__).parent / "www" / "linked-card.js"
    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(STATIC_URL, str(www_path), cache_headers=True)
        ])
    except ValueError:
        pass  # already registered (e.g. from a previous setup before unload)
    hass.http.register_view(LinkedCardsTemplatesView)
    hass.http.register_view(LinkedCardsTemplateView)


class LinkedCardsTemplatesView(HomeAssistantView):
    url = "/api/linked_cards/templates"
    name = "api:linked_cards:templates"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        return self.json({"templates": hass.data[DOMAIN]["data"].get("templates", {})})


class LinkedCardsTemplateView(HomeAssistantView):
    url = "/api/linked_cards/templates/{template_id}"
    name = "api:linked_cards:template"
    requires_auth = True

    async def get(self, request: web.Request, template_id: str) -> web.Response:
        if not _valid_template_id(template_id):
            return self.json_message("Invalid template id", status_code=400)
        hass: HomeAssistant = request.app["hass"]
        templates = hass.data[DOMAIN]["data"].get("templates", {})
        template = templates.get(template_id)
        if template is None:
            return self.json_message("Template not found", status_code=404)
        return self.json({"template_id": template_id, "template": template})

    async def post(self, request: web.Request, template_id: str) -> web.Response:
        if not _is_admin(request):
            return _admin_required()
        if not _valid_template_id(template_id):
            return self.json_message("Invalid template id", status_code=400)
        try:
            payload = await request.json()
            _validate_template(payload)
        except ValueError as err:
            return self.json_message(str(err), status_code=400)

        hass: HomeAssistant = request.app["hass"]
        entry = hass.data[DOMAIN]
        templates = entry["data"].setdefault("templates", {})
        if template_id not in templates and len(templates) >= _MAX_TEMPLATES:
            return self.json_message(f"Template limit reached ({_MAX_TEMPLATES})", status_code=400)
        templates[template_id] = payload
        await entry["store"].async_save(entry["data"])
        hass.bus.async_fire(EVENT_TEMPLATE_UPDATED, {"template_id": template_id, "action": "saved"})
        return self.json({"template_id": template_id, "template": payload})

    async def delete(self, request: web.Request, template_id: str) -> web.Response:
        if not _is_admin(request):
            return _admin_required()
        if not _valid_template_id(template_id):
            return self.json_message("Invalid template id", status_code=400)
        hass: HomeAssistant = request.app["hass"]
        entry = hass.data[DOMAIN]
        entry["data"].setdefault("templates", {}).pop(template_id, None)
        await entry["store"].async_save(entry["data"])
        hass.bus.async_fire(EVENT_TEMPLATE_UPDATED, {"template_id": template_id, "action": "deleted"})
        return self.json({"template_id": template_id, "deleted": True})
