import os
import sys
import json
import argparse
import urllib.request
from dotenv import load_dotenv

def send_sms(phone_number, client_name):
    base_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    anon_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not base_url or not anon_key:
        print("Supabase URL or anon key missing; cannot send SMS.")
        return False

    normalized_phone = "".join(ch for ch in str(phone_number) if ch.isdigit())
    if not normalized_phone:
        print("Phone number is required to send SMS.")
        return False

    message = f"Welcome {client_name}! Your onboarding is ready. Reply if you need help."

    payload = json.dumps({
        "to": f"+91{normalized_phone}",
        "message": message
    }).encode("utf-8")

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/functions/v1/send-sms",
        data=payload,
        headers={
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return 200 <= response.status < 300
    except Exception as exc:
        print(f"SMS send failed: {exc}")
        return False

if __name__ == "__main__":
    load_dotenv()
    
    parser = argparse.ArgumentParser(description="Send an onboarding SMS.")
    parser.add_argument("--phone", required=True, help="Client phone number")
    parser.add_argument("--name", required=True, help="Client name")
    
    args = parser.parse_args()
    
    if send_sms(args.phone, args.name):
        print("Successfully sent onboarding SMS.")
    else:
        print("Failed to send SMS.")
        sys.exit(1)
