#!/usr/bin/env python3
"""Export recent Gmail messages to JSON for `eval email real`.

Reads the IMAP account already configured in the desktop app's profile database, so it
tests the same mailbox the product ingests from.

READ-ONLY, TWICE OVER
---------------------
Nothing about the mailbox is allowed to change — an unread email must still be unread
afterwards. Two independent mechanisms enforce that:

1. The mailbox is opened with ``readonly=True``, which issues IMAP ``EXAMINE`` instead of
   ``SELECT``. In EXAMINE state the server rejects any flag change, so the guarantee holds
   even if this script asked for one.
2. Bodies are fetched with ``BODY.PEEK[]`` rather than ``BODY[]``. A plain ``BODY[]`` fetch
   sets ``\\Seen`` as a side effect — this is the single most common way a script silently
   marks a mailbox read.

As a check rather than an assumption, ``\\Seen`` is recorded per message before and after
the fetch and any difference is reported as an error.

PRIVACY
-------
The output contains real correspondence — for a legal practice, privileged client
material. It is written with owner-only permissions (0600) and belongs somewhere
temporary, not in the repository. Attachments are only downloaded with
``--with-attachments``.
"""

from __future__ import annotations

import argparse
import email
import email.header
import email.utils
import getpass
import imaplib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_PROFILE = Path.home() / ".local/share/com.tsemach.doron-desktop/documents.db"


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def load_account(db_path: Path) -> dict:
    """IMAP settings from the app's own `email_configurations` row.

    The column is named `password_enc`, but the Rust ingestion passes it straight to
    `login()` — it is plaintext. Treated the same way here rather than pretending
    otherwise.
    """
    if not db_path.exists():
        raise SystemExit(f"Profile database not found: {db_path}")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        row = conn.execute(
            "SELECT imap_server, imap_port, username, password_enc "
            "FROM email_configurations ORDER BY id DESC LIMIT 1"
        ).fetchone()
    except sqlite3.Error as exc:
        raise SystemExit(f"Could not read email_configurations: {exc}")
    finally:
        conn.close()
    if not row:
        raise SystemExit("No email account configured in the app yet.")
    return {"server": row[0], "port": int(row[1]), "username": row[2], "password": row[3]}


def decode_header(raw: str | None) -> str:
    """MIME-decode a header. Hebrew subjects arrive base64/quoted-printable encoded."""
    if not raw:
        return ""
    out = []
    for text, charset in email.header.decode_header(raw):
        if isinstance(text, bytes):
            out.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out).strip()


def body_text(msg: email.message.Message) -> str:
    """Plain-text body, falling back to HTML with tags stripped."""
    plain, html = [], []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get_filename():
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        (plain if ctype == "text/plain" else html).append(text)

    if plain:
        return "\n".join(plain).strip()
    if html:
        stripped = re.sub(r"<[^>]+>", " ", "\n".join(html))
        return re.sub(r"[ \t]{2,}", " ", stripped).strip()
    return ""


def attachments_of(msg: email.message.Message) -> list[dict]:
    out = []
    for part in msg.walk():
        name = part.get_filename()
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        out.append(
            {"name": decode_header(name), "size_kb": len(payload) // 1024, "_bytes": payload}
        )
    return out


def seen_flags(session: imaplib.IMAP4_SSL, seqs: list[bytes]) -> dict[str, bool]:
    """`\\Seen` per sequence number, for the before/after comparison."""
    if not seqs:
        return {}
    ids = b",".join(seqs).decode()
    status, data = session.fetch(ids, "(FLAGS)")
    if status != "OK":
        return {}
    out = {}
    for item in data:
        if not isinstance(item, bytes):
            continue
        line = item.decode(errors="replace")
        match = re.match(r"^(\d+)\s+\(FLAGS \(([^)]*)\)\)", line)
        if match:
            out[match.group(1)] = "\\Seen" in match.group(2)
    return out


def export(args: argparse.Namespace) -> int:
    account = load_account(Path(args.db))
    password = account["password"] or getpass.getpass(f"IMAP password for {account['username']}: ")

    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%d-%b-%Y")
    log(f"Connecting to {account['server']}:{account['port']} as {account['username']}")
    session = imaplib.IMAP4_SSL(account["server"], account["port"])
    try:
        session.login(account["username"], password)

        # EXAMINE, not SELECT: the server itself refuses flag changes in this state.
        status, _ = session.select(args.mailbox, readonly=True)
        if status != "OK":
            raise SystemExit(f"Cannot open mailbox {args.mailbox!r}")

        status, data = session.search(None, f'(SINCE {since})')
        if status != "OK":
            raise SystemExit("IMAP SEARCH failed")
        seqs = data[0].split()
        if args.limit:
            seqs = seqs[-args.limit :]
        log(f"{len(seqs)} message(s) since {since} in {args.mailbox}")
        if not seqs:
            return 0

        before = seen_flags(session, seqs)
        unread_before = sum(1 for v in before.values() if not v)
        log(f"  {unread_before} of them currently unread — must stay that way")

        emails, attach_dir = [], None
        if args.with_attachments:
            attach_dir = Path(args.out).parent / "attachments"
            attach_dir.mkdir(parents=True, exist_ok=True)
            os.chmod(attach_dir, 0o700)

        for i, seq in enumerate(seqs, 1):
            # BODY.PEEK[] — a plain BODY[] fetch would set \Seen.
            status, data = session.fetch(seq.decode(), "(BODY.PEEK[])")
            if status != "OK" or not data or not isinstance(data[0], tuple):
                log(f"  skipped sequence {seq.decode()}: fetch failed")
                continue
            msg = email.message_from_bytes(data[0][1])

            sender_name, sender_email = email.utils.parseaddr(decode_header(msg.get("From")))
            refs = (msg.get("References") or "").split()
            atts = attachments_of(msg)

            saved = []
            for att in atts:
                entry = {"name": att["name"], "size_kb": att["size_kb"]}
                if attach_dir is not None and att["_bytes"]:
                    safe = re.sub(r"[^\w.\-]", "_", att["name"]) or "attachment"
                    path = attach_dir / f"{i:04d}_{safe}"
                    path.write_bytes(att["_bytes"])
                    os.chmod(path, 0o600)
                    entry["path"] = str(path)
                saved.append(entry)

            date_hdr = msg.get("Date")
            try:
                received = email.utils.parsedate_to_datetime(date_hdr).isoformat()
            except (TypeError, ValueError):
                received = ""

            emails.append(
                {
                    "message_id": (msg.get("Message-ID") or f"<seq{seq.decode()}@local>").strip(),
                    "sender": sender_email,
                    "sender_name": sender_name or None,
                    "subject": decode_header(msg.get("Subject")),
                    "body_text": body_text(msg),
                    "received_at": received,
                    "in_reply_to": (msg.get("In-Reply-To") or "").strip() or None,
                    "references": refs,
                    "attachments": saved,
                    "was_unread": not before.get(seq.decode(), True),
                    "mailbox": args.mailbox,
                }
            )
            if i % 25 == 0:
                log(f"  fetched {i}/{len(seqs)}")

        # Prove the mailbox is untouched rather than trusting that it is.
        after = seen_flags(session, seqs)
        changed = [s for s in before if s in after and before[s] != after[s]]
        if changed:
            log(f"\nERROR: \\Seen changed on {len(changed)} message(s): {changed[:10]}")
            log("This is a bug in this script — please report it.")
            return 2
        log(f"  verified: read/unread status unchanged on all {len(before)} message(s)")

        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "account": account["username"],
            "mailbox": args.mailbox,
            "days": args.days,
            "emails": emails,
        }
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        os.chmod(out_path, 0o600)
        log(f"\nWrote {len(emails)} email(s) to {out_path} (mode 0600)")
        log("This file contains real correspondence — delete it when you are done.")
        return 0
    finally:
        try:
            session.close()
        except (imaplib.IMAP4.error, OSError):
            pass
        try:
            session.logout()
        except (imaplib.IMAP4.error, OSError):
            pass


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--db", default=str(DEFAULT_PROFILE), help="app profile database")
    p.add_argument("--out", default="./real_emails.json", help="output JSON path")
    p.add_argument("--days", type=int, default=30, help="how far back to read")
    p.add_argument("--mailbox", default="INBOX")
    p.add_argument("--limit", type=int, default=0, help="cap on messages (0 = no cap)")
    p.add_argument(
        "--with-attachments",
        action="store_true",
        help="also save attachment files, so the matcher can read their text",
    )
    return export(p.parse_args())


if __name__ == "__main__":
    sys.exit(main())
