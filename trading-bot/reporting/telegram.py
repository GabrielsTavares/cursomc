import json
import os
import urllib.parse
import urllib.request


def send_message(text: str, token: str | None = None, chat_id: str | None = None) -> None:
    """Envia uma mensagem HTML usando as mesmas variáveis de ambiente do Freqtrade."""
    token = token or os.environ["FREQTRADE__TELEGRAM__TOKEN"]
    chat_id = chat_id or os.environ["FREQTRADE__TELEGRAM__CHAT_ID"]
    data = urllib.parse.urlencode(
        {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"}
    ).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data)
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.load(resp)
    if not body.get("ok"):
        raise RuntimeError(f"Telegram recusou a mensagem: {body}")
