import os.path
import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Define the scopes. Use 'calendar' to create meetings, or 'calendar.readonly' just to view.
SCOPES = ['https://www.googleapis.com/auth/calendar']

def get_user_calendar_service():
    creds = None
    # 'token.json' stores the user's access and refresh tokens.
    # It is created automatically when the user authorizes the app for the first time.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        
    # If there are no valid credentials, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Loads the credentials.json you downloaded from Google Cloud Console
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            # This opens the user's default browser for login
            creds = flow.run_local_server(port=0)
            
        # Save the credentials for the next run
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)

def main():
    service = get_user_calendar_service()

    # --- 1. DISPLAY USER'S MEETINGS ---
    print("Fetching the next 5 meetings...")
    now = datetime.datetime.utcnow().isoformat() + 'Z'
    events_result = service.events().list(
        calendarId='primary', 
        timeMin=now,
        maxResults=5, 
        singleEvents=True,
        orderBy='startTime'
    ).execute()
    
    events = events_result.get('items', [])
    for event in events:
        start = event['start'].get('dateTime', event['start'].get('date'))
        print(f"{start} - {event.get('summary', 'No Title')}")

    # --- 2. SET A NEW MEETING ---
    print("\nCreating a new meeting...")
    meeting_details = {
        'summary': 'User Consultation Meeting',
        'description': 'Discussing project milestones.',
        'start': {
            'dateTime': '2026-08-25T14:00:00',
            'timeZone': 'UTC',
        },
        'end': {
            'dateTime': '2026-08-25T15:00:00',
            'timeZone': 'UTC',
        },
        'attendees': [
            {'email': 'client@example.com'},
        ],
    }

    created_event = service.events().insert(calendarId='primary', body=meeting_details).execute()
    print(f"Meeting created successfully! Link: {created_event.get('htmlLink')}")

if __name__ == '__main__':
    main()
