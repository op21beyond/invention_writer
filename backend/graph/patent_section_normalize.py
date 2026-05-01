"""draft 단계에서 LLM이 본문을 abstract·draft 한곳에 몰았을 때 섹션을 보정한다."""

from __future__ import annotations

import re
from typing import Any


def _t(s: Any) -> str:
    return str(s or "").strip()


def _structured_fill_score(doc: dict[str, Any]) -> int:
    keys = ("background", "problem", "solution", "effects", "embodiments")
    return sum(1 for k in keys if len(_t(doc.get(k))) >= 120)


def _split_paragraphs(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n+", text)
    return [p.strip() for p in parts if len(p.strip()) >= 40]


def normalize_patent_sections_after_draft_llm(doc: dict[str, Any]) -> dict[str, Any]:
    """
    공유 문서가 draft/abstract에만 몰린 경우 단락을 나눠 섹션에 분배한다.
    이미 여러 섹션이 채워져 있으면 abstract 과다만 정리한다.
    """
    out = dict(doc)
    if _structured_fill_score(out) >= 3:
        _trim_bloated_abstract(out)
        return out

    source = _t(out.get("draft"))
    if not source:
        source = _t(out.get("abstract"))
    if len(source) < 400:
        _trim_bloated_abstract(out)
        return out

    paras = _split_paragraphs(source)
    if len(paras) < 2:
        paras = [p.strip() for p in re.split(r"(?<=[.!?。])\s+", source) if len(p.strip()) > 60]
    if not paras:
        paras = [source]

    section_keys = ["background", "problem", "solution", "effects", "embodiments"]
    need = [k for k in section_keys if len(_t(out.get(k))) < 100]
    for i, k in enumerate(need):
        if i >= len(paras):
            break
        out[k] = paras[i][:12000]

    if len(paras) > len(need) and need:
        rest = "\n\n".join(paras[len(need) :])
        emb = _t(out.get("embodiments"))
        out["embodiments"] = (emb + "\n\n" + rest).strip()[:26000] if emb else rest[:26000]

    if paras:
        ab = _t(out.get("abstract"))
        if len(ab) > 1200 or not ab:
            s0 = paras[0]
            out["abstract"] = (s0[:900] + "…") if len(s0) > 900 else s0

    if not _t(out.get("title")) and paras:
        line = paras[0].split("\n")[0].strip()
        if 5 < len(line) < 200:
            out["title"] = line

    _trim_bloated_abstract(out)
    return out


def _trim_bloated_abstract(doc: dict[str, Any]) -> None:
    ab = _t(doc.get("abstract"))
    if len(ab) > 1400:
        doc["abstract"] = ab[:1200].rstrip() + "…"
