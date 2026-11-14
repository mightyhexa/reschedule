"""WhatsApp (Meta Cloud API) and email. If a provider is not configured the message goes to an
in-memory OUTBOX instead (visible at /dev/outbox in dev only), so everything works locally."""
from __future__ import annotations

import logging
import smtplib
from collections import deque
from email.message import EmailMessage

import httpx

from .config import get_settings

S = get_settings()
log = logging.getLogger("reschedule.notify")
OUTBOX: deque = deque(maxlen=100)


def whatsapp_configured() -> bool:
    return bool(S.wa_token and S.wa_phone_number_id)


def email_configured() -> bool:
    return bool(S.smtp_host)


def _outbox(channel: str, to: str, text: str) -> None:
    if not S.is_prod:  # never keep message bodies (they can hold login codes) in prod
        OUTBOX.append({"channel": channel, "to": to, "text": text})
    log.info("[%s not configured] message queued for %s***", channel, to[:3])


def send_email(to: str, subject: str, body: str) -> bool:
    if not to:
        return False
    if not email_configured():
        _outbox("email", to, f"{subject}\n{body}")
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = S.mail_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(S.smtp_host, S.smtp_port, timeout=10) as smtp:
            smtp.starttls()
            if S.smtp_user:
                smtp.login(S.smtp_user, S.smtp_password)
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        log.warning("email send failed: %s", type(e).__name__)
        return False


def send_whatsapp_template(phone: str, template: str, params: list[str], preview: str = "",
                           button_param: str | None = None) -> bool:
    """Send an approved template. `preview` is what the dev outbox shows when not configured."""
    if not phone:
        return False
    if not whatsapp_configured():
        _outbox("whatsapp", phone, preview or " | ".join(params))
        return False
    comps = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}]
    if button_param:  # authentication templates repeat the code on the copy-code button
        comps.append({"type": "button", "sub_type": "url", "index": "0",
                      "parameters": [{"type": "text", "text": button_param}]})
    payload = {"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "template",
               "template": {"name": template, "language": {"code": S.wa_lang}, "components": comps}}
    try:
        r = httpx.post(f"https://graph.facebook.com/v20.0/{S.wa_phone_number_id}/messages", json=payload,
                       headers={"Authorization": f"Bearer {S.wa_token}"}, timeout=10)
        if r.status_code >= 300:
            log.warning("whatsapp send failed: %s", r.status_code)
            return False
        return True
    except httpx.HTTPError as e:
        log.warning("whatsapp send error: %s", type(e).__name__)
        return False


def send_otp(target: str, code: str, purpose: str) -> bool:
    """Send a one-time code to an email address or an E.164 phone number."""
    if "@" in target:
        return send_email(target, "Your ReSchedule code",
                          f"Your ReSchedule code is {code}. It expires in 5 minutes. "
                          "If you did not ask for it, ignore this message.")
    return send_whatsapp_template(target, S.wa_otp_template, [code],
                                  preview=f"Your ReSchedule code is {code}", button_param=code)


def notify_user(user, message: str, link: str) -> bool:
    """Tell a team member something needs them: WhatsApp if they have a phone, else email."""
    if getattr(user, "phone", None):
        return send_whatsapp_template(user.phone, S.wa_notify_template, [message, link],
                                      preview=f"{message} {link}")
    if getattr(user, "email", None):
        return send_email(user.email, "ReSchedule: action needed", f"{message}\n{link}")
    return False
