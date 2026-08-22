import os.path
import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Updated SCOPES to include BOTH Calendar and Contacts (Read-Only)
SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/contacts.readonly'
]

def get_google_credentials():
  creds = None
  # 'token.json' stores the user's access and refresh tokens.
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

  return creds

def main():
  # Get the credentials once for both services
  creds = get_google_credentials()
  
  # Build both the Calendar and People (Contacts) API services
  calendar_service = build('calendar', 'v3', credentials=creds)
  people_service = build('people', 'v1', credentials=creds)

  # --- 1. DISPLAY USER'S MEETINGS (Your Existing Code) ---
  print("--- CALENDAR ---")
  print("Fetching the next 5 meetings...")
  now = datetime.datetime.utcnow().isoformat() + 'Z'
  events_result = calendar_service.events().list(
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

  # --- 2. FETCH AND DISPLAY GOOGLE CONTACTS (New Code) ---
  print("\n--- CONTACTS ---")
  print("Fetching the first 10 contacts...")
  
  # We ask for names and email addresses specifically
  connections_result = people_service.people().connections().list(
    resourceName='people/me',
    pageSize=10,
    personFields='names,emailAddresses'
  ).execute()
  
  connections = connections_result.get('connections', [])

  if not connections:
    print("No contacts found.")
  else:
    for person in connections:
      # Get the contact's name safely
      names = person.get('names', [])
      name = names[0].get('displayName') if names else "No Name"
      
      # Get the contact's email safely
      emails = person.get('emailAddresses', [])
      email = emails[0].get('value') if emails else "No Email"
      
      print(f"👤 {name} - ✉️ {email}")

if __name__ == '__main__':
  main()
