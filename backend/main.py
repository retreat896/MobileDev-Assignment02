from fastapi import FastAPI, HTTPException, status, WebSocket, WebSocketDisconnect
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel, Field
from dotenv import load_dotenv, find_dotenv
import os
import hashlib

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

# ----- WEBSOCKET ----- 

connections = []
async def send_to_clients(sender: str, event_type: str, payload: any, excluding=None):
    for client in connections:
        # Skip the client, if they were the sender
        if client == excluding:
            continue

        # Assemble the data to send
        data = {
            "username": sender,
            "event_type": event_type,
            "payload": payload
        }

        await client.send_json(data)

async def send_file_to_clients(sender: str, filename: str, data: bytes, verify: dict, excluding=None):
    # Tell the client a file is being sent
    verify['filename'] = filename # Send the filename
    await send_to_clients(sender, "file_start", verify)

    # Send file data in chunks
    chunk_size = 1024 * 64  # 64KB chunks
    data = list(data)
    data_length = len(data)
    print(f"Sending {data_length/chunk_size} chunks to {len(connections)} clients...")
    for i in range(0, data_length, chunk_size):
        # Get bytes chunk
        chunk = data[i:i + chunk_size]

        print(f"Size: {len(chunk)} bytes")
        
        # Determine the event type (different if last chunk)
        event_type = "file" if (i + chunk_size) < data_length else "file_end"

        # Make a payload with the bytes and filename (for concurrent downloads)
        payload = { "filename": filename, "bytes": chunk }

        # Send the chunk to the client
        await send_to_clients(sender, event_type, payload, excluding)
    print(f"Done.")

async def send_error(receiver, event_type, payload):
    await receiver.send_json({
        "username": "system",
        "event_type": event_type,
        "payload": payload
    })

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Add the connected websocket to list
    connections.append(websocket)

    print("Client connected")

    waiting_for_file = False # Indicates whether the websocket is waiting on file contents
    file_name = str() # Name of the file
    file_data = bytes() # Byte Array -- Pre-declared so as to update later
    hash_alg = "sha256" # The algorithm to use when hashing

    try:
        while True:
            # Wait for message from client
            data = await websocket.receive_json()
            
            # Data from client
            event_type = data.get("event_type")
            payload = data.get("payload")
            sender = data.get("username")
            
            # --- HEARTBEAT LOGIC ---
            if event_type == "ping":
                await websocket.send_json({ "username": "server", "message": "pong" })
                continue # Skip the rest of the loop so we don't echo "ping" to chat
                
            #
            #   TODO: Change waiting_for_file into a Dictionary, so multiple files can be sent concurrently (in order). -- And general logic feels safer
            #
            elif event_type == "file_start":
                waiting_for_file = True # Flag that a file is queued
                file_name = payload
            elif waiting_for_file and event_type == "file":
                print(f"Received (chunk) from {sender}: {len(payload)} bytes")
                # Add the payload to the received file data
                file_data += bytes(payload)
            elif event_type == "file_end":
                waiting_for_file = False # Flag that the file was received
                print(f"Received from {sender}: {file_name} ({len(file_data)} bytes)")

                # Verify file integrity by sending hash
                calculated_hash = hashlib.new(hash_alg, file_data).hexdigest()
                
                # Create the fingerprint dict (to hold hash and algorithm)
                fingerprint = {
                    "hash": calculated_hash,
                    "algorithm": hash_alg
                }

                print(
                    f"""
                    Hash calculated for file (from {sender}):
                        Algorithm: {hash_alg}
                        Hash: {calculated_hash}
                        File Name: {file_name}
                    """
                )

                # Forward the file to other clients
                # Don't exclude the sender, since I removed the logic from App
                await send_file_to_clients(sender, file_name, file_data, fingerprint)
                
                # Erase the file data
                file_name = str()
                file_data = bytes()
            elif event_type == "message":
                # Forward the message to other clients
                print(f"Received from {sender}: {payload}")

                # Don't exclude the sender, since I removed the logic from App
                send_to_clients(sender, "message", payload, excluding=None)
        
            # -----------------------

            # convert from json to message and user {message:'', user:""}

           

            # Echo back 
            # response = f"Server echo: {data}"
            # await websocket.send_text(response)

    except WebSocketDisconnect:
        connections.remove(websocket)
        print(f"Client disconnected ({len(connections)} clients)")
    except Exception as e:
        print("Unexpected error:", e)
        try:
            connections.remove(websocket)
            print(f"Client disconnected ({len(connections)} clients)")
            await websocket.close()
        except:
            pass