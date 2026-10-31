"""uv run python -m pytest tests"""

import re

import pytest

from sunwai.privacy import pseudonym, scrub


@pytest.mark.parametrize("text", [
    "call me on 9876543210",
    "call me on 98765 43210",
    "call me on 98765-43210",
    "call me on +91 9876543210",
    "call me on +91-98765-43210",
    "call me on 09876543210",
    "call me on 919876543210",
])
def test_phone_formats(text):
    out, kinds = scrub(text)
    assert out == "call me on [phone]"
    assert kinds == ["phone"]


def test_email():
    assert scrub("mail priya.k+mess@college.edu.in pls") == ("mail [email] pls", ["email"])


@pytest.mark.parametrize("text, expected", [
    ("I'm 2K23/CO/123", "I'm [roll]"),
    ("roll 23BCS123 here", "roll [roll] here"),
    ("21cse1045 here", "[roll] here"),
    ("enrolment number: 00114802722", "enrolment number: [roll]"),
    ("roll no 45, geyser kharab", "roll no [roll], geyser kharab"),
    ("Roll No. A-1234", "Roll No. [roll]"),
])
def test_roll_numbers(text, expected):
    out, kinds = scrub(text)
    assert out == expected
    assert kinds == ["roll"]


@pytest.mark.parametrize("text, expected", [
    ("Hi, my name is Rahul Sharma from Hostel B", "Hi, my name is [name] from Hostel B"),
    ("my name is rahul, the fan is dead", "my name is [name], the fan is dead"),
    ("I am Priya, room 204", "I am [name], room 204"),
    ("This is Kunal Verma from block C", "This is [name] from block C"),
    ("Myself Aman, hostel A", "Myself [name], hostel A"),
    ("Name: Rohit", "Name: [name]"),
    ("mera naam Aman hai, geyser kharab hai", "mera naam [name] hai, geyser kharab hai"),
])
def test_names(text, expected):
    out, kinds = scrub(text)
    assert out == expected
    assert kinds == ["name"]


@pytest.mark.parametrize("text", [
    "I am in Hostel B and I am very angry",
    "This is Hostel A, floor 2, room 214",
    "I am Not happy, This is the third time",
    "regular roll call at 9 pm",
    "net nahi chal raha since 24hrs, fixed in 40 min",
    "I did it myself and nothing changed",
    "geyser in Hostel A not working since Monday",
])
def test_leaves_ordinary_complaints_alone(text):
    assert scrub(text) == (text, [])


def test_mixed_report_lists_each_kind_once_in_order():
    text = "my name is Riya, 23BCS123, riya@x.com, 9876543210 and 9123456780, Hostel B room 112 geyser"
    out, kinds = scrub(text)
    assert out == "my name is [name], [roll], [email], [phone] and [phone], Hostel B room 112 geyser"
    assert kinds == ["email", "phone", "roll", "name"]


def test_scrub_is_idempotent():
    once, _ = scrub("I am Priya, 23BCS123, 98765 43210, priya@college.edu")
    assert scrub(once) == (once, [])


def test_empty_text():
    assert scrub("") == ("", [])


def test_pseudonym_is_stable_and_short():
    sid = pseudonym("scenario-wifi-07")
    assert re.fullmatch(r"S-[0-9a-f]{4}", sid)
    assert pseudonym("scenario-wifi-07") == sid
    assert pseudonym("scenario-wifi-08") != sid


def test_pseudonym_salt_changes_ids(monkeypatch):
    plain = pseudonym("student-1")
    monkeypatch.setenv("SUNWAI_ID_SALT", "campus-secret")
    assert pseudonym("student-1") != plain
