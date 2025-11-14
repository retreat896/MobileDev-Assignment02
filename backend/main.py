from fastapi import FastAPI, HTTPException, status
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel, Field
from dotenv import load_dotenv, find_dotenv
import os

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
