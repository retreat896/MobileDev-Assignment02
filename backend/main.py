from fastapi import FastAPI, Query, HTTPException, status, WebSocket, WebSocketDisconnect
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel, Field
from dotenv import load_dotenv, find_dotenv
import os
import hashlib
import secrets
from datetime import datetime, timedelta
import asyncio

print("Loaded dotenv:", load_dotenv(find_dotenv(".env")))

# ----- Database Setup -----
uri = os.getenv("DB_LINK")
client = MongoClient(uri)
db = client["MyDB"]
collection = db["MyCollection"]

# ----- FastAPI App -----
app = FastAPI(
    title="Robot Inventory API",
    description="CRUD API for managing robots stored in MongoDB.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Token & Session Management -----

# Store active connections by token: {token: websocket}
upload_connections: dict[str, WebSocket] = {}
download_connections: dict[str, WebSocket] = {}

# Store uploaded media (until sent to all receiving clients)
uploaded_media: dict[str, dict[str, dict]] = {}

# Store token metadata: {token: {username, created_at, last_seen}}
token_metadata: dict[str, dict] = {}

# Token expiry time (7 days)
TOKEN_EXPIRY = timedelta(days=7)

def generate_token() -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)

def is_token_valid(token: str) -> bool:
    """Check if token exists and hasn't expired"""
    if token not in token_metadata:
        return False
    
    metadata = token_metadata[token]
    created_at = metadata.get("created_at")
    
    if not created_at:
        return False
    
    # Check if token expired
    if datetime.now() - created_at > TOKEN_EXPIRY:
        # Clean up expired token
        if token in upload_connections:
            del upload_connections[token]
        if token in download_connections:
            del download_connections[token]
        del token_metadata[token]
        return False
    
    return True

# ----- Pydantic Models -----

class TokenRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=16, description="Username between 3-16 characters")

class TokenResponse(BaseModel):
    token: str
    username: str
    expires_in: int  # seconds until expiry

# ----- ROUTES -----

@app.get(
    "/",
    tags=["System"],
    summary="Serve index.html",
    response_description="Returns the homepage HTML file."
)
def read_root():
    path = Path(__file__).resolve().parent / "index.html"
    return FileResponse(path, media_type="text/html")

@app.post(
    "/ws/auth/token",
    tags=["Authentication"],
    summary="Generate authentication token",
    response_model=TokenResponse,
    response_description="Returns a new authentication token for WebSocket connection"
)
def create_token(request: TokenRequest):
    """
    Generate a new authentication token for a user.
    The token is valid for 7 days and allows WebSocket connection.
    """
    username = request.username.strip()
    
    # Validate username
    if len(username) < 3 or len(username) > 16:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be between 3 and 16 characters"
        )
    
    # Generate new token
    token = generate_token()
    
    # Store token metadata
    token_metadata[token] = {
        "username": username,
        "created_at": datetime.now(),
        "last_seen": datetime.now(),
        "files": {}
    }
    
    print(f"✨ Generated token for user: {username}")
    
    return TokenResponse(
        token=token,
        username=username,
        expires_in=int(TOKEN_EXPIRY.total_seconds())
    )

# ----- WEBSOCKET ----- 

async def send_to_clients(sender_token: str, event_type: str, payload: any, excluding=None):
    for client in download_connections.values():
        # There is no websocket, the client disconnected
        if client.get("disconnected"):
            continue

        # Skip the client, if they were the sender
        if client is not excluding:
            # Assemble the data to send
            data = {
                "username": token_metadata[sender_token]["username"],
                "event_type": event_type,
                "payload": payload
            }

            print("Sending...")

            await client.send_json(data)

async def send_file_to_clients(sender_token: str, file_name: str, file: dict, excluding=None):
    # Send file data in chunks
    chunk_size = 1024 * 64  # 64KB chunks
    
    content = list(file["content"])
    filesize = len(content)
    
    print(f"Sending {filesize / chunk_size} chunks to {len(download_connections.values())} clients...")
    for i in range(0, filesize, chunk_size):
        # Get bytes chunk
        chunk = content[i:i + chunk_size]
        # print(f"Size: {len(chunk)} bytes")

        if i == 0:
            event_type = "file_start"   # The first chunk
        elif i + chunk_size < filesize:
            event_type = "file"         # Anything in-between
        else:
            event_type = "file_end"     # The last chunk

        # Make a payload with the bytes and filename (for concurrent downloads)
        payload = { "file_name": file_name, "bytes": chunk }

        # This is the first chunk to send
        if event_type == "file_start":
            # Include non-functional, verifying data with first chunk
            # That way if existing data matches the hash and name, can ignore
            payload["size"] = filesize
            payload["timestamp"] = file["timestamp"]
            payload["hash"] = file["hash"]
            payload["algorithm"] = file["algorithm"]

        # Send the chunk to the client
        await send_to_clients(sender_token, event_type, payload, excluding=excluding)

        if (i // chunk_size) % 3 == 0:
            await asyncio.sleep(0)  # Yield to event loop

    print("Done.")

async def send_error(receiver, event_type, payload):
    await receiver.send_json({
        "username": "system",
        "event_type": event_type,
        "payload": payload
    })

waiting_for_file = False # Indicates whether the websocket is waiting on file contents
file_name = str() # Name of the file
file_data = bytes() # Byte Array -- Pre-declared so as to update later
hash_alg = "sha256" # The algorithm to use when hashing

def upload_file(event_type: str, payload: dict, token: str):
    # The username of the sender
    username = token_metadata[token]["username"]

    # The filename of the upload
    file_name = payload.get("file_name")
    # The file content
    content = bytes(payload.get("bytes"))
    # The expected file hash/algorithm (optional)
    client_hash = str(payload.get("hash")).lower()
    client_algorithm = str(payload.get("algorithm")).lower()

    if not file_name:
        print("!!! No File Name !!!")
        return None

    # The data for the client's file with this name, if exists
    upload = token_metadata[token]["files"].get(file_name)

    # The upload storage has pre-existing file data
    if (upload and upload.get("content")):
        # Increment the file byte-data
        upload["content"] += content
    
    # The start of a new file (overwrites existing of same name)
    if event_type == "file_start":
        # Create a new file with corresponding name
        upload = {} # Empty Dictionary

        # Initialize defaults
        upload.setdefault("in_progress", True)          # File is incomplete
        upload.setdefault("timestamp", datetime.timestamp(datetime.now()))  # When the file was received 
        upload.setdefault("content", content)           # Default content
        upload.setdefault("hash", None)                 # No hash
        upload.setdefault("algorithm", None)            # No hash-algorithm
    # The last piece of an uploaded file
    elif event_type == "file_end":
        print(f"Received from {token[:8]}... ({username}): {file_name} ({len(upload["content"])} bytes)")
        
        # Verify file integrity using client hash
        if client_hash and client_algorithm:
            server_hash = hashlib.new(client_algorithm, bytes(upload["content"])).hexdigest()

            # Hash verification failed
            if server_hash != client_hash:
                print(
                    f"""
                    Failed to verify hash for file from {token[:8]}... ({username})
                        File Name:  {file_name}
                        Expected:   {client_hash}
                        Calculated: {server_hash}
                        Algorithm:  {client_algorithm}
                    """
                )

                # Clear the upload data
                upload = None

        # Ensure the upload is still valid
        # -- May not be if client_hash verified
        if upload is not None:
            # Verify file integrity with server hash
            upload["hash"] = hashlib.new(hash_alg, bytes(upload["content"])).hexdigest()
            upload["algorithm"] = hash_alg

            print(
                f"""
                Hash calculated for file (from {token})      
                    File Name:  {file_name}
                    Calculated: {upload["hash"]}
                    Algorithm:  {upload["algorithm"]}
                """
            )

            # Mark the upload as complete (remove the attribute)
            upload.pop("in_progress")

    # Update the token_metadata saved filedata
    token_metadata[token]["files"][file_name] = upload

    # Return the updated filedata
    return token_metadata[token]["files"][file_name], file_name

def upload_message(event_type: str, payload: dict, token: str):
    username = token_metadata[token]["username"]
    text = payload.get("text")
    # Optional timestamp payload
    timestamp = payload.get("timestamp") or datetime.timestamp(datetime.now())

    # Forward the message to other clients
    print(f"Received from {token[:8]}... ({username}): {text}")

    # Return the text and timestamp
    return text, timestamp

async def handle_download(event_type, params, excluded=None):
    # print(f"DOWNLOAD: {event_type}")

    if event_type == "file":
        await send_file_to_clients(params[0], params[1], params[2], excluded)
    elif event_type == "message":
        await send_to_clients(params[0], params[1], params[2], excluded)

def handle_upload(token: str, data: dict):
    # Data from client
    event_type = str(data.get("event_type"))
    payload = data.get("payload")
    sender = str(data.get("username"))

    # print(f"UPLOAD: {event_type}")

    # The sender updated their username
    if sender != token_metadata[token]["username"]:
        print(f"Updating username for ({token[:8]}): {token_metadata[token]["username"]} --> {sender}")

        # Update the client's username
        token_metadata[token]["username"] = sender
        # TODO Send updated notification, for clients to update UI?
    
    # --- HEARTBEAT LOGIC ---
    # if event_type == "ping":
    #     await websocket.send_json({ "username": "server", "message": "pong" })
    #     return # Skip the rest of the loop so we don't echo "ping" to chat
    # --- UPLOAD HANDLING ---
    if event_type.startswith("file"):
        # Handle the file upload
        file, file_name = upload_file(event_type, payload, token)

        # The file is incomplete
        if file and file.get("in_progress"):
            # Move onto the next upload
            return

        print(f"Received from {sender}: {file_name} ({len(file.get("content"))} bytes)")

        # Queue the next download
        # Send the complete file to all connected clients
        asyncio.create_task(handle_download("file", (token, file_name, file), None)) #download_connections.get(token)
    # --- MESSAGE HANDLING ---
    elif event_type == "message":
        text, timestamp = upload_message(event_type, payload, token)

        # Construct the payload
        payload = { "timestamp": timestamp, "text": text }

        # Queue the next download
        asyncio.create_task(handle_download("message", (token, "message", payload), None)) #download_connections.get(token)
        
        # Don't exclude the sender, since I removed the logic from App
        # asyncio.create_task(send_to_clients(token, "message", payload))
    # -----------------------

@app.websocket("/ws/upload")
async def upload_endpoint(websocket: WebSocket, token: str = Query(...)):
    # Validate token
    if not is_token_valid(token):
        await websocket.close(code=1008, reason="Invalid or expired token")
        print("UPLOAD: Rejected connection: Invalid token")
        return
    
    try:
        await websocket.accept()
            
        # Check if there's already a connection with this token
        if upload_connections.get(token):
            print(f"UPLOAD: Client reconnected: (Token: {token[:8]}...)")
        else:
            print(f"UPLOAD: New client connected: (Token: {token[:8]}...)")
        
        # Store the new connection
        upload_connections[token] = websocket
        token_metadata[token]["last_seen"] = datetime.now()

        while True:
            # Wait for message from client
            data = await websocket.receive_json()
            
            # Run the general upload handler
            handle_upload(token, data)

    except WebSocketDisconnect:
        print(f"UPLOAD: Client disconnected ({len(upload_connections.values())} clients)")
        upload_connections[token] = { "disconnected": True }
    except Exception as e:
        print("Unexpected error:", e)
        try:
            print(f"UPLOAD: Client disconnected ({len(upload_connections.values())} clients)")
            upload_connections[token] = { "disconnected": True }
            await websocket.close()
        except:
            pass

@app.websocket("/ws/download")
async def download_endpoint(websocket: WebSocket, token: str = Query(...)):
    # Validate token
    if not is_token_valid(token):
        await websocket.close(code=1008, reason="Invalid or expired token")
        print("DOWNLOAD: Rejected connection: Invalid token")
        return
    
    try:
        await websocket.accept()
            
        # Check if there's already a connection with this token
        if download_connections.get(token):
            print(f"DOWNLOAD: Client reconnected: (Token: {token[:8]}...)")
        else:
            print(f"DOWNLOAD: New client connected: (Token: {token[:8]}...)")
        
        # Store the new connection
        download_connections[token] = websocket
        token_metadata[token]["last_seen"] = datetime.now()

        while True:
            # Do nothing -- Download only exists to send to the client
            await asyncio.sleep(60)


    except WebSocketDisconnect:
        print(f"DOWNLOAD: Client disconnected ({len(download_connections.values())} clients)")
        download_connections[token] = { "disconnected": True }
    except Exception as e:
        print("Unexpected error:", e)
        try:
            print(f"DOWNLOAD: Client disconnected ({len(download_connections.values())} clients)")
            download_connections[token] = { "disconnected": True }
            await websocket.close()
        except:
            pass