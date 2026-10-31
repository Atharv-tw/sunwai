"""Privacy (D-011, D-030): scrub personal data out of a student's words before any Meko write, and give each
student a stable pseudonym. Room numbers and buildings stay: the agents need them to find the fault."""

from __future__ import annotations

import hashlib
import os
import re

# Words that follow "I am" / "this is" with a capital letter but are not names
_NOT_NAMES = {
    "a", "an", "the", "in", "at", "on", "from", "of", "not", "no", "very", "so", "too", "really", "still",
    "also", "just", "only", "now", "here", "there", "writing", "reporting", "complaining", "staying", "living",
    "facing", "having", "getting", "unable", "sick", "ill", "tired", "angry", "upset", "done", "fed", "sorry",
    "hostel", "block", "mess", "library", "room", "floor", "wing", "first", "second", "third", "final",
    "student", "resident", "warden", "caretaker", "hi", "hello", "sir", "maam", "ma'am", "bhaiya", "bhai",
    "urgent", "again", "fine", "ok", "okay", "sure", "going", "trying", "waiting", "and", "or", "but", "to",
    "for", "with", "is", "was", "will", "can", "have", "had", "it", "this", "that", "my", "our", "your",
    "ridiculous", "unacceptable", "terrible", "horrible", "pathetic", "worst", "bad", "frustrating",
    "disgusting", "fourth", "hungry", "scared", "worried", "new", "late",
}

_WORD = r"[A-Za-z][a-z'’]+"
_CAP = r"[A-Z][a-z'’]+"

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Indian mobiles: 10 digits starting 6-9, optional +91 / 91 / 0, single spaces or dashes allowed between digits
_PHONE = re.compile(r"(?<![\w+])(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\w)")
_ROLLS = [
    re.compile(r"\b2K\d{2}/[A-Z]{2,4}/\d{1,4}\b", re.I),        # DTU style: 2K23/CO/123
    re.compile(r"\b\d{2}[A-Z]{2,4}\d{2,5}\b", re.I),            # 23BCS123, 21CSE1045
    re.compile(r"\b\d{11,12}\b"),                                # 11-12 digit enrolment numbers
]
# "roll no 45", "enrolment number: A-1234" -> keep the words, drop the number
_ROLL_LABEL = re.compile(
    r"\b((?:roll|enrol(?:l)?ment|admission|registration|reg)\b\s*(?:no\b\.?|number|num|#)?\s*[:\-]?\s*)"
    r"(?=[A-Z/\-]*\d)([A-Z0-9][A-Z0-9/\-]{1,14})\b", re.I,
)
# Names: any case after "my name is" / "name:", capitalised only after "I am" / "this is" / "myself"
_NAME_SURE = re.compile(rf"\b((?:my name is|my name's)\s+|\bname\s*[:\-]\s*)({_WORD}(?:\s+{_WORD})?)", re.I)
_NAME_HINGLISH = re.compile(rf"\b(mera naam\s+)({_WORD}(?:\s+{_WORD})?)(?=\s+(?:hai|h)\b)", re.I)
_NAME_MAYBE = re.compile(rf"\b((?:I am|I'm|I’m|i am|i'm|[Tt]his is|[Mm]yself)\s+)({_CAP}(?:\s+{_CAP})?)")


def _names(text: str) -> tuple[str, int]:
    count = 0

    def sure(m: re.Match) -> str:
        nonlocal count
        words = m.group(2).split()
        keep = []
        for w in words:  # stop at "from", "in", "hostel" ...: those are places, not names
            if w.lower() in _NOT_NAMES:
                break
            keep.append(w)
        if not keep:
            return m.group(0)
        count += 1
        rest = " ".join(words[len(keep):])
        return f"{m.group(1)}[name]" + (f" {rest}" if rest else "")

    def maybe(m: re.Match) -> str:
        first = m.group(2).split()[0]
        return m.group(0) if first.lower() in _NOT_NAMES else sure(m)

    text = _NAME_SURE.sub(sure, text)
    text = _NAME_HINGLISH.sub(sure, text)
    text = _NAME_MAYBE.sub(maybe, text)
    return text, count


def scrub(text: str) -> tuple[str, list[str]]:
    """Replace emails, phone numbers, roll/enrolment numbers and self-introduced names with
    `[email]`, `[phone]`, `[roll]`, `[name]`. Returns the scrubbed text and the kinds removed, in that order."""
    removed: list[str] = []
    text, n = _EMAIL.subn("[email]", text or "")
    if n:
        removed.append("email")
    text, n = _PHONE.subn("[phone]", text)
    if n:
        removed.append("phone")
    rolls = 0
    text, n = _ROLL_LABEL.subn(lambda m: f"{m.group(1)}[roll]", text)
    rolls += n
    for rx in _ROLLS:
        text, n = rx.subn("[roll]", text)
        rolls += n
    if rolls:
        removed.append("roll")
    text, n = _names(text)
    if n:
        removed.append("name")
    return text, removed


def pseudonym(seed: str) -> str:
    """Stable `S-xxxx` id from a seed (a demo seed or, in a real deployment, a login id). Only the hash is kept;
    set `SUNWAI_ID_SALT` in a real deployment so ids cannot be recomputed from guessed login ids."""
    salt = os.getenv("SUNWAI_ID_SALT", "")
    return "S-" + hashlib.sha256(f"{salt}{seed}".encode()).hexdigest()[:4]
