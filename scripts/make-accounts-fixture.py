"""
Generate a synthetic account-review fixture.

Every value is invented. The archetypes mirror the shapes measured in the real
extract — minted domains, counter runs, instant activation, and the awkward
cases where a handle looks machine-made on a consumer mailbox and is not — so
the fixture exercises every display rule and every question in the config,
including the ones the real file never triggers (missing email, missing events,
awaiting-activation, enriched network data).

Deterministic: seeded, so regenerating produces the same file.
"""

import csv
import json
import random
from datetime import datetime, timedelta, timezone

rng = random.Random(20261002)

CONSUMER = [
    "gmail.com", "hotmail.com", "hotmail.co.uk", "yahoo.com", "outlook.com",
    "icloud.com", "aol.com", "gmx.de", "live.nl", "yandex.ru",
]
REGIONAL = ["orange.fr", "libero.it", "seznam.cz", "telenet.be", "bluewin.ch"]
# Invented second-level labels on real-but-spam-adjacent TLDs, so the domain
# questions have something to recognise. None of these are registered by us and
# none carry meaning beyond the fixture.
MINTED = [
    "vextrahold.faith", "quillmorrow.trade", "brindlewick.loan", "tarnhollow.win",
    "glimmerpost.review", "sablefern.racing", "duskwillow.bid", "hollowmarch.men",
]
SIBLINGS = ["driftvolumea.club", "driftvolumeb.club", "driftvolumec.club"]
DISPOSABLE = ["mailscrap.site", "tossbox.cc", "binmail.link", "quickdrop.space"]
PLATFORM = ["arena-accounts.net", "questrev.com", "guildgram.me", "livequestmap.fr"]
AUTOGEN = ["marlowkft28.com", "petrovicgls41.net", "haraldsen77.org"]

FIRST = ["Maria", "James", "Sofia", "Lukas", "Chloe", "Noah", "Elena", "Ivan",
         "Hannah", "Pedro", "Anja", "Tomas", "Freya", "Milo", "Zara", "Oscar"]
LAST = ["Vasquez", "Okafor", "Lindqvist", "Moreau", "Bianchi", "Kowalski",
        "Nakamura", "Silva", "Novak", "Ahmed", "Dubois", "Keller"]
NICK = ["pixelraven", "frostgoat", "emberlark", "quietmoth", "tinvulture",
        "glasshare", "ashenpike", "softkestrel", "duskotter", "paleheron"]
WORDS = ["Hubs", "Zing", "Mug", "Lier", "Jute", "Elm", "Via", "Kyat", "Burns",
         "Homed", "Coups", "Prim", "Dims", "Spuds", "Ids", "Skreem", "Lea", "Tee"]

LEET = str.maketrans({"i": "1", "o": "0", "e": "3", "a": "4", "s": "5"})


def hexid() -> str:
    return "".join(rng.choice("0123456789abcdef") for _ in range(32))


def when(base: datetime, days: int = 0) -> datetime:
    return base + timedelta(days=days, seconds=rng.randint(0, 86_399))


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


EVENT_FIELDS = [
    "timestamp", "event_type", "ip_address", "client_id", "country", "subdivision",
    "user_agent", "successful", "error", "is_anonymous", "is_anonymous_vpn",
    "is_hosting_provider", "is_public_proxy", "is_residential_proxy",
    "is_tor_exit_node", "asn_org",
]


def event(ts: datetime, kind: str, **over) -> dict:
    base = {f: None for f in EVENT_FIELDS}
    base.update(timestamp=iso(ts), event_type=kind, successful=True)
    for flag in EVENT_FIELDS[9:15]:
        base[flag] = False
    base.update(over)
    return base


def timeline(created: datetime, activate_after: float | None, extra_logins: int = 0, **over) -> str:
    """Creation, usually an activation, and occasionally some logins."""
    events = {"1": event(created, "account_creation", **over)}
    n = 2
    if activate_after is not None:
        events[str(n)] = event(created + timedelta(seconds=activate_after), "activation", **over)
        n += 1
    for i in range(extra_logins):
        events[str(n)] = event(created + timedelta(days=3 * (i + 1)), "login", **over)
        n += 1
    return json.dumps(events)


ENRICHED = {
    "ip_address": "198.51.100.37", "country": "GB", "subdivision": "ENG",
    "asn_org": "Example Broadband Ltd", "client_id": "web-client",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
PROXIED = {**ENRICHED, "country": "NL", "asn_org": "Example Hosting BV",
           "is_hosting_provider": True, "is_anonymous_vpn": True}


# --- identity shapes -------------------------------------------------------

def human_name() -> tuple[str, str]:
    handle = f"{rng.choice(FIRST)}{rng.choice(LAST)}"
    if rng.random() < 0.5:
        handle += str(rng.randint(1, 99))
    return handle, f"{handle.lower()}@{rng.choice(CONSUMER)}"


def human_nick() -> tuple[str, str]:
    handle = rng.choice(NICK) + (str(rng.randint(1, 999)) if rng.random() < 0.6 else "")
    return handle, f"{handle}@{rng.choice(CONSUMER)}"


def human_separator() -> tuple[str, str]:
    handle = f"{rng.choice(FIRST).lower()}{rng.choice('._-')}{rng.choice(LAST).lower()}"
    return handle, f"{handle}@{rng.choice(CONSUMER + REGIONAL)}"


def mashup() -> str:
    return "".join(rng.sample(WORDS, 3))


def stem_counter() -> tuple[str, int]:
    return "".join(rng.sample(WORDS, 2)), rng.randint(100_000, 999_999)


def random_string(n: int = 11) -> str:
    return "".join(rng.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(n))


def neighbours(rows: int = 10, *, shape=None) -> tuple[list[str], list[str]]:
    """Ten registration neighbours. `shape` supplies the related ones."""
    emails, names = [], []
    for i in range(rows):
        if shape is not None and i < shape[0]:
            handle, addr = shape[1](i)
        elif rng.random() < 0.45:
            handle, addr = human_name() if rng.random() < 0.5 else human_nick()
        else:
            handle = mashup()
            addr = f"{handle}@{rng.choice(MINTED)}"
        emails.append(addr)
        names.append(handle)
    return emails, names


records: list[dict] = []
key: list[dict] = []
START = datetime(2024, 3, 1, tzinfo=timezone.utc)


def add(archetype: str, label: str, *, handle: str, email: str, events: str,
        nb=None, status: str = "active", created: datetime | None = None) -> None:
    made = created or when(START, rng.randint(0, 400))
    ne, nn = nb if nb is not None else neighbours()
    records.append({
        "guid": hexid(),
        "user_created_at": iso(made),
        "user_status": status,
        "email": email,
        "prev_10_emails": ",".join(ne),
        "username": handle,
        "prev_10_usernames": ",".join(nn),
        "events": events,
    })
    key.append({"guid": records[-1]["guid"], "archetype": archetype, "expected_label": label})


# --- bots ------------------------------------------------------------------

for _ in range(4):
    # A minted domain shared with the accounts registered just before it, and an
    # activation too fast to be a person. The strongest shape in the real data.
    stem = "".join(rng.sample(WORDS, 2))
    domain = rng.choice(MINTED)
    created = when(START, rng.randint(0, 400))
    nb = neighbours(shape=(4, lambda i, s=stem, d=domain: (f"{s}{mashup()}", f"{s}{mashup()}@{d}")))
    handle = f"{stem}{mashup()}"
    add("minted-domain-run", "bot", handle=handle, email=f"{handle}@{domain}",
        events=timeline(created, rng.uniform(2, 9)), nb=nb, created=created)

for _ in range(3):
    # A stem plus a counter, with neighbours a few numbers either side.
    stem, n = stem_counter()
    domain = rng.choice(PLATFORM)
    nb = neighbours(shape=(5, lambda i, s=stem, n=n, d=domain: (f"{s}{n - 7 + i}", f"{s}{n - 7 + i}@{d}")))
    add("counter-run", "bot", handle=f"{stem}{n}", email=f"{stem}{n}@{domain}",
        events=timeline(when(START), rng.uniform(1, 6)), nb=nb)

for _ in range(3):
    handle = f"pT{rng.randint(1_400_000_000_000, 1_599_999_999_999)}"
    add("timestamp-handle", "bot", handle=handle,
        email=f"{handle}@{rng.choice(MINTED)}", events=timeline(when(START), rng.uniform(1, 5)))

for _ in range(4):
    plain = mashup()
    handle = plain.translate(LEET)
    add("leetspeak", "bot", handle=handle, email=f"{handle.lower()}@{rng.choice(MINTED)}",
        events=timeline(when(START), rng.uniform(3, 20)))

for _ in range(3):
    handle = mashup()
    add("disposable-mailbox", "bot", handle=handle,
        email=f"{handle.lower()}@{rng.choice(DISPOSABLE)}", events=timeline(when(START), rng.uniform(2, 15)))

for _ in range(3):
    handle = rng.choice(NICK) + str(rng.randint(10, 9999))
    add("platform-themed-domain", "bot", handle=handle,
        email=f"{handle}@{rng.choice(PLATFORM)}", events=timeline(when(START), rng.uniform(2, 12)))

for _ in range(3):
    # Sibling domains differing by one character — invisible to `sameDomain`.
    handle = mashup()
    domain = rng.choice(SIBLINGS)
    others = [d for d in SIBLINGS if d != domain]
    nb = neighbours(shape=(4, lambda i, o=others: (mashup(), f"{mashup()}@{o[i % len(o)]}")))
    add("sibling-domains", "bot", handle=handle, email=f"{handle.lower()}@{domain}",
        events=timeline(when(START), rng.uniform(2, 10)), nb=nb)

for _ in range(3):
    handle = random_string()
    add("random-string-handle", "bot", handle=handle,
        email=f"{handle}@{rng.choice(MINTED)}", events=timeline(when(START), rng.uniform(1, 8)))

for _ in range(3):
    handle = mashup()
    add("word-mashup", "bot", handle=handle, email=f"{handle}@{rng.choice(AUTOGEN)}",
        events=timeline(when(START), rng.uniform(4, 30)))

for _ in range(2):
    handle = "".join(rng.choice("bcdfghjklmnpqrstvwxz") for _ in range(9))
    add("no-vowels", "bot", handle=handle, email=f"{handle}@{rng.choice(MINTED)}",
        events=timeline(when(START), rng.uniform(2, 12)))

for _ in range(3):
    # The hard one: automated, but on an ordinary mailbox. 15% of consumer-domain
    # rows in the real extract were bots, and nothing about the domain says so.
    handle = rng.choice(NICK).capitalize() + str(rng.randint(100, 999))
    add("consumer-domain-bot", "bot", handle=handle,
        email=f"{handle.lower()}@{rng.choice(CONSUMER)}", events=timeline(when(START), rng.uniform(2, 8)))

for _ in range(2):
    handle = mashup()
    add("proxied-events", "bot", handle=handle, email=f"{handle.lower()}@{rng.choice(MINTED)}",
        events=timeline(when(START), rng.uniform(2, 9), **PROXIED))

# --- humans ----------------------------------------------------------------

for _ in range(6):
    handle, email = human_name()
    add("real-name", "human", handle=handle, email=email,
        events=timeline(when(START), rng.uniform(300, 90_000), extra_logins=rng.randint(0, 3)))

for _ in range(5):
    handle, email = human_nick()
    add("chosen-nickname", "human", handle=handle, email=email,
        events=timeline(when(START), rng.uniform(200, 40_000), extra_logins=rng.randint(0, 2)))

for _ in range(3):
    handle, email = human_separator()
    add("separator-handle", "human", handle=handle, email=email,
        events=timeline(when(START), rng.uniform(600, 120_000)))

for _ in range(3):
    # Looks machine-made, is not. The trap every shape rule falls into, and the
    # reason no rule in the config claims "human".
    handle = rng.choice(NICK).upper().translate(LEET)
    add("leet-looking-human", "human", handle=handle,
        email=f"{handle.lower()}@{rng.choice(CONSUMER)}",
        events=timeline(when(START), rng.uniform(1_000, 60_000), extra_logins=2))

for _ in range(2):
    handle, _ = human_name()
    add("apple-relay", "human", handle=handle,
        email=f"{random_string(12)}@privaterelay.appleid.com",
        events=timeline(when(START), rng.uniform(400, 20_000)))

for _ in range(2):
    handle, _ = human_nick()
    add("regional-isp", "human", handle=handle, email=f"{handle}@{rng.choice(REGIONAL)}",
        events=timeline(when(START), rng.uniform(500, 50_000), extra_logins=1))

for _ in range(2):
    handle, email = human_name()
    add("enriched-events", "human", handle=handle, email=email,
        events=timeline(when(START), rng.uniform(800, 30_000), extra_logins=2, **ENRICHED))

# --- sparse and edge cases the real extract never produces ------------------

handle, email = human_nick()
add("no-events", "human", handle=handle, email=email, events="{}")

handle = mashup()
add("no-neighbours", "bot", handle=handle, email=f"{handle}@{rng.choice(MINTED)}",
    events=timeline(when(START), 4.0), nb=([], []))

handle, _ = human_name()
add("no-email", "human", handle=handle, email="",
    events=timeline(when(START), rng.uniform(900, 40_000)))

handle, email = human_name()
add("awaiting-activation", "human", handle=handle, email=email,
    events=timeline(when(START), None), status="awaiting-activation")

handle = mashup()
add("awaiting-reactivation", "bot", handle=handle, email=f"{handle}@{rng.choice(MINTED)}",
    events=timeline(when(START), None), status="awaiting-reactivation")

handle, email = human_name()
add("failed-activation", "human", handle=handle, email=email,
    events=json.dumps({
        "1": event(START, "account_creation"),
        "2": event(START + timedelta(seconds=4_210), "activation", successful=False,
                   error="token_expired"),
        "3": event(START + timedelta(seconds=9_900), "activation"),
    }))

rng.shuffle(records)
order = {r["guid"]: i for i, r in enumerate(records)}
key.sort(key=lambda k: order[k["guid"]])

COLUMNS = ["guid", "user_created_at", "user_status", "email", "prev_10_emails",
           "username", "prev_10_usernames", "events"]

with open("examples/accounts.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator=chr(10))
    w.writeheader()
    w.writerows(records)

with open("examples/accounts-key.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["guid", "archetype", "expected_label"], lineterminator=chr(10))
    w.writeheader()
    w.writerows(key)

print(f"{len(records)} records")
import collections
for a, n in collections.Counter(k["archetype"] for k in key).most_common():
    print(f"  {a:24} {n}")
print("bot:", sum(1 for k in key if k["expected_label"] == "bot"),
      "human:", sum(1 for k in key if k["expected_label"] == "human"))
