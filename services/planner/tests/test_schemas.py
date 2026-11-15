import pytest
from pydantic import ValidationError

from tests.helpers import recipe, request


def test_valid() -> None:
    assert request([recipe("a")]).days[0].slots[0].servings_centi == 100


@pytest.mark.parametrize(
    ("kw", "msg"),
    [
        ({"members": []}, "min_length"),
        ({"locked": {(0, "dinner"): "zzz"}}, "verrouillée inconnue"),
    ],
)
def test_invalid_references(kw: dict[str, object], msg: str) -> None:
    with pytest.raises(ValidationError, match=msg if msg != "min_length" else "at least 1"):
        request([recipe("a")], **kw)


def test_unknown_ingredient_and_duplicates() -> None:
    with pytest.raises(ValidationError, match="ingrédient inconnu"):
        request([recipe("a", ingredients=[{"ingredient_id": "x", "qty_per_serving_centi": 1}])])
    with pytest.raises(ValidationError, match="dupliqués"):
        request([recipe("a"), recipe("a")])
    with pytest.raises(ValidationError, match="créneau dupliqué"):
        request([recipe("a")], slots=["dinner", "dinner"])
    with pytest.raises(ValidationError, match="Extra inputs"):
        request([recipe("a", extra=1)])


def test_unknown_attendee() -> None:
    req = request([recipe("a")])
    body = req.model_dump()
    body["days"][0]["slots"][0]["attendees"] = ["ghost"]
    with pytest.raises(ValidationError, match="convive inconnu"):
        type(req).model_validate(body)
