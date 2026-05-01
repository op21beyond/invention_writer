from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)

# PatentsView (api.patentsview.org) redirects to ODP and no longer serves JSON queries.
# Official search: USPTO Open Data Portal — Patent File Wrapper search API.
ODP_SEARCH_URL = "https://api.uspto.gov/api/v1/patent/applications/search"
MAX_RESULTS_TOTAL = 25
MAX_PER_QUERY = 25
HTTP_TIMEOUT = 60.0


def _sanitize_odp_q(text: str) -> str:
    """Build a safe simplified-query string for ODP (avoid breaking JSON / Solr special cases)."""
    if not text or not str(text).strip():
        return ""
    s = " ".join(str(text).split())
    for ch in ('"', "'", "\n", "\r", "\t"):
        s = s.replace(ch, " ")
    return s.strip()[:800]


def _meta_dict(item: dict[str, Any]) -> dict[str, Any]:
    meta = item.get("applicationMetaData")
    if isinstance(meta, dict):
        return meta
    if isinstance(meta, list) and meta and isinstance(meta[0], dict):
        return meta[0]
    return {}


def _normalize_record(item: dict[str, Any], source_query: str) -> dict[str, Any]:
    app_no = item.get("applicationNumberText") or item.get("applicationNumber") or ""
    meta = _meta_dict(item)
    patent_num = (
        meta.get("patentNumber")
        or meta.get("patentNumberText")
        or meta.get("grantNumber")
        or ""
    )
    title = (
        meta.get("inventionTitle")
        or meta.get("inventionTitleText")
        or meta.get("title")
        or ""
    )
    filing = meta.get("filingDate") or meta.get("effectiveFilingDate") or ""
    num = str(patent_num).strip() if patent_num else ""
    if not num and app_no:
        num = str(app_no).strip()
    return {
        "patent_number": num or "unknown",
        "title": (str(title).strip() if title else "(no title)"),
        "application_number": str(app_no).strip() if app_no else "",
        "filing_date": str(filing).strip() if filing else "",
        "source": "uspto_odp",
        "source_query": source_query,
    }


class USPTOClient:
    async def search(self, queries: list[dict]) -> list[dict[str, Any]]:
        if not queries:
            return []

        settings = get_settings()
        api_key = (settings.uspto_api_key or "").strip()
        if not api_key:
            logger.warning(
                "USPTO_API_KEY is not set; ODP patent search is skipped. "
                "Register at https://data.uspto.gov/apis/getting-started"
            )
            return []

        texts: list[str] = []
        for item in queries:
            raw = item.get("query")
            if raw is None:
                continue
            q = _sanitize_odp_q(str(raw))
            if q and q not in texts:
                texts.append(q)
        if not texts:
            return []

        merged: list[dict[str, Any]] = []
        seen: set[str] = set()

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            for text in texts:
                if len(merged) >= MAX_RESULTS_TOTAL:
                    break
                need = min(MAX_PER_QUERY, MAX_RESULTS_TOTAL - len(merged))
                batch = await self._search_odp(client, api_key, text, need)
                for rec in batch:
                    ident = rec.get("application_number") or rec.get("patent_number") or ""
                    if ident and ident in seen:
                        continue
                    if ident:
                        seen.add(ident)
                    merged.append(rec)

        return merged[:MAX_RESULTS_TOTAL]

    async def _search_odp(
        self,
        client: httpx.AsyncClient,
        api_key: str,
        q: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        headers = {"x-api-key": api_key, "Accept": "application/json"}
        limit_n = max(1, min(limit, 100))
        # Matches ODP examples: https://data.uspto.gov/apis/api-syntax-examples
        full_payload: dict[str, Any] = {
            "q": q,
            "pagination": {"offset": 0, "limit": limit_n},
            "sort": [{"field": "applicationMetaData.filingDate", "order": "desc"}],
            "fields": ["applicationNumberText", "applicationMetaData"],
        }
        minimal_payload: dict[str, Any] = {
            "q": q,
            "pagination": {"offset": 0, "limit": limit_n},
        }

        payloads_to_try = (full_payload, minimal_payload)

        for attempt in range(3):
            rate_limited = False
            for payload in payloads_to_try:
                try:
                    r = await client.post(ODP_SEARCH_URL, headers=headers, json=payload)
                except httpx.HTTPError as exc:
                    logger.warning("USPTO ODP request failed: %s", exc)
                    return []

                if r.status_code == 429:
                    rate_limited = True
                    break

                if r.status_code == 401 or r.status_code == 403:
                    logger.warning(
                        "USPTO ODP returned %s — check USPTO_API_KEY at data.uspto.gov",
                        r.status_code,
                    )
                    return []

                if r.status_code == 400:
                    continue

                if r.status_code != 200:
                    body = (r.text or "")[:500]
                    logger.warning("USPTO ODP search HTTP %s: %s", r.status_code, body)
                    return []

                try:
                    data = r.json()
                except ValueError:
                    logger.warning("USPTO ODP returned non-JSON body")
                    return []

                bag = data.get("patentFileWrapperDataBag")
                if bag is None:
                    bag = data.get("patentFileWrapperDataBags") or []
                if not isinstance(bag, list):
                    logger.warning("USPTO ODP response missing patentFileWrapperDataBag list")
                    return []

                out: list[dict[str, Any]] = []
                for item in bag:
                    if not isinstance(item, dict):
                        continue
                    out.append(_normalize_record(item, q))
                return out

            if rate_limited:
                await asyncio.sleep(1.0 * (attempt + 1))
                continue

            return []

        return []
