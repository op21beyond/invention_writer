from __future__ import annotations


def build_patent_search_queries(
    anchor_document: dict | None, *, database: str
) -> list[dict]:
    if not anchor_document:
        return []
    summary = anchor_document.get("summary", "")
    return [{"query": summary, "database": database, "target_component": "summary"}]
