import os
import sys
import argparse
from dotenv import load_dotenv

def send_email(to_email, client_name):
    """
    Placeholder function for sending an onboarding email.
    In a real scenario, this would use smtplib or an API.
    """
    print(f"--- Onboarding Email ---")
    print(f"To: {to_email}")
    print(f"Subject: Welcome to the Premium Experience, {client_name}!")
    print(f"Body: Hello {client_name},\n\nWe are thrilled to have you onboard...")
    print(f"------------------------")
    return True

if __name__ == "__main__":
    load_dotenv()
    
    parser = argparse.ArgumentParser(description="Send an onboarding email.")
    parser.add_argument("--email", required=True, help="Client email address")
    parser.add_argument("--name", required=True, help="Client name")
    
    args = parser.parse_args()
    
    if send_email(args.email, args.name):
        print("Successfully 'sent' onboarding email.")
    else:
        print("Failed to send email.")
        sys.exit(1)
