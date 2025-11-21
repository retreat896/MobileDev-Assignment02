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

# ----- Models -----
class Robot(BaseModel):
    id: int | None = Field(default=None, description="Unique robot ID")
    name: str = Field(..., example="RoboDog")
    price: float = Field(..., example=19.99)
    description: str = Field(..., example="A cute robot puppy")
    imageUrl: str = Field(..., example="https://example.com/dog.jpg")


# ----- Helper -----
def get_next_id():
    last = collection.find_one(sort=[("id", -1)])
    return (last["id"] + 1) if last and "id" in last else 1


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


@app.get(
    "/robots",
    tags=["Robots"],
    summary="Get all robots",
    response_description="Returns a list of all robots."
)
def get_robots():
    try:
        robots = list(collection.find())
        for r in robots:
            r["_id"] = str(r["_id"])
        return robots
    except PyMongoError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database not reachable")
    except Exception:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")


@app.get(
    "/robot/{id}",
    tags=["Robots"],
    summary="Get robot by ID",
    responses={
        200: {"description": "Robot found"},
        404: {"description": "Robot not found"},
    }
)
def get_robot(id: int):
    try:
        existing = collection.find_one({"id": id})
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Robot not found")

        existing["_id"] = str(existing["_id"])
        return existing

    except PyMongoError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database not reachable")
    except Exception:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")


@app.post(
    "/robot",
    status_code=status.HTTP_201_CREATED,
    tags=["Robots"],
    summary="Create a new robot",
    responses={
        201: {"description": "Robot created successfully"},
        503: {"description": "Database not reachable"},
    }
)
def post_robot(robot: Robot):
    try:
        new_id = get_next_id()
        robot_data = robot.model_dump()
        robot_data["id"] = new_id

        collection.insert_one(robot_data)

        return {"message": "Robot added successfully", "id": new_id}

    except PyMongoError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database not reachable")
    except Exception:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")


@app.delete(
    "/robot/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Robots"],
    summary="Delete a robot",
    responses={
        204: {"description": "Robot deleted successfully"},
        404: {"description": "Robot not found"},
    }
)
def delete_robot(id: int):
    try:
        result = collection.delete_one({"id": id})

        if result.deleted_count == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Robot not found")

        return None

    except PyMongoError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database not reachable")
    except Exception:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")


@app.put(
    "/robot",
    tags=["Robots"],
    summary="Update an existing robot",
    responses={
        200: {"description": "Robot updated successfully"},
        404: {"description": "Robot not found"},
        503: {"description": "Database not reachable"},
    }
)
def put_robot(robot: Robot):
    try:
        existing = collection.find_one({"id": robot.id})
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Robot not found")

        updates = robot.model_dump()
        collection.update_one({"id": robot.id}, {"$set": updates})

        return {"message": "Robot updated successfully"}

    except PyMongoError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database not reachable")
    except Exception:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")

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