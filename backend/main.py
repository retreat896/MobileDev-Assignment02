from fastapi import FastAPI, HTTPException, status
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel

uri = "mongodb+srv://krus:KrustyPassword@mycluster.7qdmbzp.mongodb.net/" # Mongo URI
client = MongoClient(uri)
db = client["MyDB"] # Database name
collection = db["MyCollection"] # Collection name
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Robot(BaseModel):
    name: str
    price: float
    description: str
    imageUrl: str

# 200   status.HTTP_200_OK                      GET success
# 201   status.HTTP_201_CREATED                 POST created
# 204   status.HTTP_204_NO_CONTENT              DELETE success (no body)
# 400   status.HTTP_400_BAD_REQUEST             malformed request
# 404   status.HTTP_404_NOT_FOUND               missing record
# 409   status.HTTP_409_CONFLICT                duplicate resource
# 500   status.HTTP_500_INTERNAL_SERVER_ERROR   server error

# --- Root endpoint ---
@app.get("/")
def read_root():
    path = Path(__file__).resolve().parent / "index.html"
    return FileResponse(path, media_type="text/html")

# --- Get all robots ---
@app.get("/robots")
def get_robots():
    try:
        robots = list(collection.find()) # Retrieve all documents
        for r in robots:
            r["_id"] = str(r["_id"]) # Convert ObjectId to string
        return robots
    except PyMongoError as e:
        print("Database error:", e)
        raise HTTPException(status_code=503, detail="Database not reachable")
    except Exception as e:
        print("Unexpected error:", e)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/robot/{name}")
def get_robot(name: str):
    try:
        # Trim whitespace and try to find the robot
        name = name.strip()
        existing = collection.find_one({"name": name})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robot not found")

        return existing
    except PyMongoError as e:
        print("Database Error: ", e)
        raise HTTPException(status_code=503, detail="Database not reachable")
    except Exception as e:
        print("Unexpected Error: ", e)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/robot", status_code=status.HTTP_201_CREATED)
def post_robot(robot: Robot):
    try: 
        collection.insert_one(robot.dict())
        return {"message": "Robot added successfully"}
        print("todo")
    except PyMongoError as e:
        print("Database error:", e)
        raise HTTPException(status_code=503, detail="Database not reachable")
    except Exception as e:
        print("Unexpected error:", e)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.put("/robot/{name}", status_code=status.HTTP_204_NO_CONTENT)
def put_robots(name: str, robot: Robot):
    try:
        # Trim whitespace and try to find the robot
        name = name.strip()
        existing = collection.find_one({"name": name})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robot not found")
        # Only update price, description, imageUrl
        updates = {
            "price": robot.price,
            "description": robot.description,
            "imageUrl": robot.imageUrl
        }
        collection.update_one({"name": name}, {"$set": updates})
        return {"message": "Robot updated successfully"}
    except PyMongoError as e:
        print("Database Error: ", e)
        raise HTTPException(status_code=503, detail="Database not reachable")
    except Exception as e:
        print("Unexpected Error: ", e)
        raise HTTPException(status_code=500, detail="Internal serve error")

@app.delete("/robots", status_code=status.HTTP_204_NO_CONTENT)
def delete_robots(robot: Robot):
    try:
        collection.delete_one(None)
        return { "message": "Robot deleted successfully" }
    except PyMongoError as e:
        print("Database Error: ", e)
        raise HTTPException(status_code=503, detail="Database not reachable")
    except Exception as e:
        print("Unexpected Error: ", e)
        raise HTTPException(status_code=500, detail="Internal serve error")
    