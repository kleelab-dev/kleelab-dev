"""Seed data for the initial template catalog."""

TEMPLATE_DEFINITIONS = [
    ("Photographer", "portfolio"), ("Designer", "portfolio"), ("Artist", "portfolio"),
    ("Startup", "business"), ("Consulting", "business"), ("Agency", "business"),
    ("Bistro", "restaurant"), ("Cafe", "restaurant"),
    ("Launch Soon", "coming_soon"), ("Product Teaser", "coming_soon"),
    ("Creator Links", "link_in_bio"), ("Social Links", "link_in_bio"),
    ("Modern Resume", "resume"), ("Executive CV", "resume"), ("Conference Event", "event"),
]


def template_config(category: str) -> dict:
    return {"sections": ["hero", "text", "gallery", "form"], "colors": {"primary": "#111827", "accent": "#2563eb", "background": "#ffffff"}, "fonts": {"heading": "system-ui", "body": "system-ui"}, "layout": {"max_width": 1200, "spacing": "comfortable"}, "category": category}