#!/usr/bin/env python3
import sys
import os
import urllib.request
import urllib.error
import mimetypes
import uuid

def upload_template(file_path, title, language, backend_url="http://localhost:3000"):
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        return False

    file_name = os.path.basename(file_path)
    with open(file_path, 'rb') as f:
        file_data = f.read()

    boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
    
    # Build multipart payload
    parts = []
    
    # File field
    parts.append(f"--{boundary}".encode('utf-8'))
    mime_type = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
    parts.append(f'Content-Disposition: form-data; name="file"; filename="{file_name}"'.encode('utf-8'))
    parts.append(f'Content-Type: {mime_type}'.encode('utf-8'))
    parts.append(b'')
    parts.append(file_data)
    
    # Title field
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append(b'Content-Disposition: form-data; name="title"')
    parts.append(b'')
    parts.append(title.encode('utf-8'))
    
    # Language field
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append(b'Content-Disposition: form-data; name="language"')
    parts.append(b'')
    parts.append(language.encode('utf-8'))
    
    # Close boundary
    parts.append(f"--{boundary}--".encode('utf-8'))
    
    body = b'\r\n'.join(parts)
    
    headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Content-Length': str(len(body))
    }
    
    url = f"{backend_url}/api/templates/upload"
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    
    try:
        print(f"Uploading '{file_name}' to {url}...")
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            print("\n" + "="*50)
            print("Upload Succeeded!")
            print(res_body)
            print("="*50)
            return True
    except urllib.error.HTTPError as e:
        print(f"\nUpload Failed (HTTP Error {e.code}): {e.reason}")
        try:
            print(e.read().decode('utf-8'))
        except Exception:
            pass
        return False
    except Exception as e:
        print(f"\nUpload Failed (Connection Error): {e}")
        print("Is your Next.js backend server running on http://localhost:3000?")
        return False

def main():
    # Parse args or enter interactive mode
    if len(sys.argv) == 4:
        file_path = sys.argv[1]
        title = sys.argv[2]
        language = sys.argv[3]
    else:
        print("="*50)
        print("Document Template Upload (Interactive Mode)")
        print("="*50)
        
        file_path = input("Enter path to file: ").strip()
        while not file_path or not os.path.exists(file_path):
            if not file_path:
                print("Path cannot be empty.")
            else:
                print(f"File not found: {file_path}")
            file_path = input("Enter path to file: ").strip()

        # Suggest default title
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        suggested_title = base_name.replace("_", " ").replace("-", " ").title()
        
        title = input(f"Enter title (default: {suggested_title}): ").strip()
        if not title:
            title = suggested_title

        language = input("Enter language (he / en) [default: he]: ").strip().lower()
        if not language:
            language = "he"
        while language not in ["he", "en"]:
            print("Language must be 'he' or 'en'.")
            language = input("Enter language (he / en) [default: he]: ").strip().lower()

    if language not in ["he", "en"]:
        print("Error: Language must be either 'he' or 'en'.")
        sys.exit(1)

    success = upload_template(file_path, title, language)
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
