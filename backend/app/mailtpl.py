"""Branded transactional email: one layout, a handful of messages.

Table-based HTML with inline styles so it renders in Gmail, Outlook and Apple Mail. No remote images
(many clients block them), so the logo is drawn with coloured table cells. A dark-mode block and a
phone-width block are included. Every message also has a plain-text twin."""
from __future__ import annotations

from html import escape

CREAM, IVORY, INK, SOFT = "#F7F1E6", "#FFFDF8", "#2A1F18", "#7A6A58"
TERRA, SAGE, AMBER, LINE = "#C8643B", "#7F9670", "#E0A33A", "#E8DCC8"
SERIF = "Georgia,'Times New Roman',serif"
SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
AUTHOR = "Built by Fahad"

_CSS = f"""
@media only screen and (max-width:620px){{
  .wrap{{width:100%!important}} .pad{{padding:28px 22px!important}} .code{{font-size:34px!important;letter-spacing:8px!important}}
  .h1{{font-size:26px!important}}
}}
@media (prefers-color-scheme:dark){{
  .bg{{background:#17120E!important}} .card{{background:#221A14!important;border-color:#3A2E24!important}}
  .ink{{color:#F4ECDF!important}} .soft{{color:#B9A994!important}}
  .codebox{{background:#2C221A!important;border-color:#4A3A2C!important}} .rule{{border-color:#3A2E24!important}}
}}
"""


def _logo() -> str:
    cell = lambda c, w=18: f'<td width="{w}" height="9" style="background:{c};border-radius:3px;font-size:0;line-height:0">&nbsp;</td><td width="3" style="font-size:0">&nbsp;</td>'
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;vertical-align:middle">'
            f'<tr><td></td><td></td>{cell(AMBER)}{cell(TERRA)}</tr><tr><td height="3" style="font-size:0;line-height:0">&nbsp;</td></tr>'
            f'<tr>{cell(SAGE)}{cell(SAGE)}{cell(SAGE)}</tr></table>')


def _button(label: str, href: str) -> str:
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 0"><tr>'
            f'<td style="background:{INK};border-radius:999px"><a href="{escape(href, quote=True)}" '
            f'style="display:inline-block;padding:14px 30px;font-family:{SANS};font-size:15px;font-weight:600;'
            f'color:#FFFDF8;text-decoration:none">{escape(label)}</a></td></tr></table>')


def _shell(preheader: str, title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>{escape(title)}</title><style>{_CSS}</style></head>
<body class="bg" style="margin:0;padding:0;background:{CREAM}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{CREAM}">{escape(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:{CREAM}"><tr><td align="center" style="padding:36px 14px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="wrap" style="width:560px;max-width:560px">
    <tr><td style="padding:0 6px 18px">{_logo()}<span class="ink" style="vertical-align:middle;margin-left:10px;font-family:{SERIF};font-size:22px;color:{INK}">ReSchedule</span></td></tr>
    <tr><td class="card pad" style="background:{IVORY};border:1px solid {LINE};border-radius:22px;padding:40px 42px">{body}</td></tr>
    <tr><td align="center" class="soft" style="padding:22px 10px 0;font-family:{SANS};font-size:12.5px;line-height:1.6;color:{SOFT}">
      Disruption recovery for job shops. Repair the plan, do not rebuild it.<br>{AUTHOR}</td></tr>
  </table>
</td></tr></table></body></html>"""


def _h1(text: str) -> str:
    return f'<h1 class="h1 ink" style="margin:0 0 12px;font-family:{SERIF};font-weight:400;font-size:30px;line-height:1.2;color:{INK};text-align:center">{text}</h1>'


def _p(text: str, center: bool = True, size: int = 16) -> str:
    al = "center" if center else "left"
    return f'<p class="soft" style="margin:0 0 14px;font-family:{SANS};font-size:{size}px;line-height:1.65;color:{SOFT};text-align:{al}">{text}</p>'


_OTP = {
    "login": ("Your sign-in code", "Sign in to ReSchedule", "Use this code to finish signing in."),
    "verify": ("Confirm your email", "Welcome to ReSchedule", "Enter this code to confirm your email and open your workspace."),
    "reset": ("Reset your password", "Reset your password", "Enter this code to choose a new password."),
}


def otp_email(code: str, purpose: str, minutes: int = 5) -> tuple[str, str, str]:
    """Return (subject, html, text) for a one-time code."""
    subject_core, title, lead = _OTP.get(purpose, _OTP["login"])
    spaced = " ".join(code)
    body = (
        _h1(escape(title)) + _p(escape(lead)) +
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td align="center" class="codebox" '
        f'style="background:{CREAM};border:1px solid {LINE};border-radius:16px;padding:24px 10px">'
        f'<div class="code ink" style="font-family:\'SFMono-Regular\',Consolas,Menlo,monospace;font-size:42px;font-weight:700;letter-spacing:12px;color:{INK};padding-left:12px">{escape(code)}</div>'
        f'<div class="soft" style="margin-top:10px;font-family:{SANS};font-size:13px;color:{SOFT}">Expires in {minutes} minutes</div></td></tr></table>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr><td class="rule" style="border-top:1px solid {LINE};padding-top:20px">'
        + _p("Did not ask for this? You can ignore this email. Nobody can sign in without the code, and we will never ask you for it by phone, chat or email.", size=13.5) +
        '</td></tr></table>')
    text = (f"{title}\n\n{lead}\n\nYour code: {code}\nIt expires in {minutes} minutes.\n\n"
            "Did not ask for this? Ignore this email. We will never ask you for this code.\n\nReSchedule - " + AUTHOR)
    return f"{subject_core}: {code}", _shell(f"Your code is {spaced}. It expires in {minutes} minutes.", title, body), text


def invite_email(inviter: str, shop: str, link: str) -> tuple[str, str, str]:
    title = f"{inviter} added you to {shop}"
    body = (_h1("You have been added to a team") +
            _p(f"<strong class=\"ink\" style=\"color:{INK}\">{escape(inviter)}</strong> added you to <strong class=\"ink\" style=\"color:{INK}\">{escape(shop)}</strong> on ReSchedule. "
               "Sign in with this email address and you will get a one-time code.") + _button("Open ReSchedule", link))
    text = f"{title}.\nSign in with this email address: {link}\n\nReSchedule - {AUTHOR}"
    return f"You were added to {shop} on ReSchedule", _shell(title, title, body), text


def approval_email(message: str, link: str) -> tuple[str, str, str]:
    body = (_h1("A plan change needs your approval") + _p(escape(message)) +
            _p("Nothing changes on the shop floor until you approve it.", size=14) + _button("Review the repair", link))
    text = f"A plan change needs your approval.\n{message}\nNothing changes until you approve it: {link}\n\nReSchedule - {AUTHOR}"
    return "ReSchedule: a repair needs your approval", _shell(message, "Approval needed", body), text


def pilot_admin_email(summary: str, link: str) -> tuple[str, str, str]:
    body = _h1("New pilot request") + _p(escape(summary)) + _button("Open the admin page", link)
    text = f"New pilot request.\n{summary}\n{link}\n\nReSchedule - {AUTHOR}"
    return "New ReSchedule pilot request", _shell(summary, "New pilot request", body), text
