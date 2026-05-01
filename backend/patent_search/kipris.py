from __future__ import annotations

import asyncio
import logging
import re
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Any

import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)

# KIPRIS Plus — 특허·실용신안 키워드 검색 (공식 REST)
BASE_API_URL = "https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch"
HTTP_TIMEOUT = 120.0
DEFAULT_NUM_ROWS = 25
DEFAULT_HEADERS = {
    "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
    "User-Agent": (
        "Mozilla/5.0 (compatible; invention-writer/1.0) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}


def _local_tag(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _find_child(parent: ET.Element | None, name: str) -> ET.Element | None:
    if parent is None:
        return None
    want = name.casefold()
    for child in parent:
        if _local_tag(child.tag).casefold() == want:
            return child
    return None


def _find_children(parent: ET.Element | None, name: str) -> list[ET.Element]:
    if parent is None:
        return []
    want = name.casefold()
    return [c for c in parent if _local_tag(c.tag).casefold() == want]


def _text(el: ET.Element | None) -> str | None:
    if el is None or el.text is None:
        return None
    s = " ".join(str(el.text).split()).strip()
    return s or None


def _strip_env_quotes(raw: str) -> str:
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1].strip()
    return s


def _collect_item_elements(body: ET.Element | None) -> list[ET.Element]:
    """KIPRIS 응답은 버전에 따라 body/items/item 또는 body 하위 다른 래퍼를 쓸 수 있음."""
    if body is None:
        return []
    items_parent = _find_child(body, "items")
    found = _find_children(items_parent, "item")
    if found:
        return found
    out: list[ET.Element] = []
    for el in body.iter():
        if _local_tag(el.tag).casefold() != "item":
            continue
        if (_text(_find_child(el, "applicationNumber")) or "").strip():
            out.append(el)
    return out


def _parse_header_error(header: ET.Element | None) -> str | None:
    if header is None:
        return None
    success_yn = (_text(_find_child(header, "successYN")) or "").strip().upper()
    result_code = (_text(_find_child(header, "resultCode")) or "").strip()
    result_msg = (_text(_find_child(header, "resultMsg")) or "").strip()

    if success_yn == "Y":
        return None

    # 실패 응답 예: successYN=N, resultCode=30, resultMsg=SERVICE_KEY_IS_NOT_REGISTERED_ERROR
    if success_yn == "N":
        return result_msg or f"API 오류 코드 {result_code or '?'}"

    # successYN 없음(구버전): resultCode 로만 판단
    if result_code and result_code not in ("00", "0"):
        return result_msg or f"API 오류 코드 {result_code}"

    return None


def _parse_search_xml(xml_text: str) -> tuple[list[dict[str, Any]], int | None]:
    """(결과 목록, totalCount 또는 None). API 오류 시 ValueError."""
    xml_text = xml_text.lstrip("\ufeff").strip()
    if not xml_text:
        raise ValueError("KIPRIS 응답이 비어 있습니다.")

    root = ET.fromstring(xml_text)
    header = _find_child(root, "header")
    err = _parse_header_error(header)
    if err:
        raise ValueError(err)

    body = _find_child(root, "body")
    total_count: int | None = None
    if body is not None:
        tc = _text(_find_child(body, "totalCount"))
        if tc and tc.isdigit():
            total_count = int(tc)

    item_els = _collect_item_elements(body)
    out: list[dict[str, Any]] = []
    for item in item_els:
        app_no = _text(_find_child(item, "applicationNumber")) or ""
        title = _text(_find_child(item, "inventionTitle")) or ""
        reg_no = _text(_find_child(item, "registerNumber")) or ""
        pub_no = _text(_find_child(item, "publicationNumber")) or ""
        open_no = _text(_find_child(item, "openNumber")) or ""
        patent_no = reg_no or pub_no or open_no or app_no
        out.append(
            {
                "patent_number": patent_no or "unknown",
                "title": title or "(제목 없음)",
                "application_number": app_no,
                "register_number": reg_no,
                "publication_number": pub_no,
                "ipc_number": _text(_find_child(item, "ipcNumber")) or "",
                "applicant_name": _text(_find_child(item, "applicantName")) or "",
                "source": "kipris",
            }
        )
    return out, total_count


def _fallback_keywords(summary: str) -> list[str]:
    """긴 문장·빈 검색을 줄이기 위해 짧은 토큰 후보를 만든다."""
    s = summary.strip()
    if not s:
        return []
    # 한글·영문·숫자 덩어리
    parts = re.findall(r"[\w가-힣]{2,}", s)
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        if len(p) < 2:
            continue
        if p not in seen:
            seen.add(p)
            out.append(p)
        if len(out) >= 5:
            break
    return out


def _sanitize_word(q: str) -> str:
    s = " ".join(str(q).split()).strip()
    return s[:500]


class KIPRISClient:
    async def search(self, queries: list[dict]) -> list[dict[str, Any]]:
        results, _err = await self.search_with_error(queries)
        return results

    async def search_with_error(
        self, queries: list[dict]
    ) -> tuple[list[dict[str, Any]], str | None]:
        """(결과, 사용자에게 보여줄 오류 문구). 오류 시 결과는 빈 배열."""
        if not queries:
            return [], None

        settings = get_settings()
        raw_key = _strip_env_quotes(settings.kipris_api_key or "")
        if not raw_key:
            return [], (
                "KIPRIS_API_KEY 가 설정되지 않았습니다. "
                "plus.kipris.or.kr 에서 발급한 ServiceKey 를 backend/.env 에 넣어 주세요."
            )

        key = urllib.parse.unquote(raw_key)

        words: list[str] = []
        for item in queries:
            raw = item.get("query")
            if raw is None:
                continue
            w = _sanitize_word(str(raw))
            if w and w not in words:
                words.append(w)

        # 전체 문장으로 0건이면 짧은 키워드로 재시도할 후보
        fallback_pool: list[str] = []
        if len(words) == 1:
            fallback_pool = _fallback_keywords(words[0])

        if not words:
            return [], "검색어(anchor 요약)가 비어 있어 KIPRIS 검색을 건너뜁니다."

        merged: list[dict[str, Any]] = []
        seen: set[str] = set()
        last_error: str | None = None

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers=DEFAULT_HEADERS) as client:
            attempt_words = list(words)
            for fb in fallback_pool:
                if fb not in attempt_words:
                    attempt_words.append(fb)

            for word in attempt_words:
                if len(merged) >= DEFAULT_NUM_ROWS:
                    break
                remaining = DEFAULT_NUM_ROWS - len(merged)
                need = max(1, min(DEFAULT_NUM_ROWS, remaining))
                params = {
                    "word": word,
                    "patent": "true",
                    "utility": "true",
                    "pageNo": "1",
                    "numOfRows": str(need),
                    "ServiceKey": key,
                }
                batch: list[dict[str, Any]] = []
                total_count: int | None = None
                word_ok = False

                for attempt in range(2):
                    try:
                        r = await client.get(BASE_API_URL, params=params)
                    except httpx.HTTPError as exc:
                        logger.warning("KIPRIS request failed: %s", exc)
                        return [], f"네트워크 오류: {exc}"

                    if r.status_code != 200:
                        body = (r.text or "")[:500]
                        logger.warning("KIPRIS HTTP %s: %s", r.status_code, body)
                        return [], f"HTTP {r.status_code}"

                    try:
                        batch, total_count = _parse_search_xml(r.text)
                        word_ok = True
                        break
                    except (ET.ParseError, ValueError) as exc:
                        err_s = str(exc)
                        logger.warning("KIPRIS response error (attempt %s): %s", attempt, err_s)
                        last_error = err_s
                        if "SERVICE_KEY" in err_s or "SERVICEKEY" in err_s.upper() or "등록" in err_s:
                            return [], err_s
                        if (
                            attempt == 0
                            and (
                                "DEADLINE" in err_s.upper()
                                or "TIMEOUT" in err_s.upper()
                                or "EXPIRED" in err_s.upper()
                            )
                        ):
                            await asyncio.sleep(2.8)
                            continue
                        break

                if not word_ok:
                    continue

                if not batch and total_count == 0:
                    logger.info(
                        "KIPRIS: 검색어 %r 에 대한 일치 건수 0 (totalCount=0)", word[:80]
                    )
                    continue

                for rec in batch:
                    rec = {**rec, "source_query": word}
                    ident = rec.get("application_number") or rec.get("patent_number") or ""
                    if ident in seen:
                        continue
                    if ident:
                        seen.add(ident)
                    merged.append(rec)

                if merged:
                    last_error = None
                    break

        if not merged and last_error:
            return [], last_error
        if not merged:
            return (
                [],
                "KIPRIS에서 일치하는 특허를 찾지 못했습니다. "
                "검색어를 더 구체적인 기술 키워드로 바꿔 보거나, 세션의 search_queries 를 수정해 보세요.",
            )
        return merged[:DEFAULT_NUM_ROWS], None
