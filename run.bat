@echo off

:: Start frontend in separate terminal
start "Frontend Server" cmd /k "npm run start"
:: Start backend in separate terminal
cd backend
start "Backend Server" cmd /k "python -m uvicorn main:app --reload --host 0.0.0.0 --port 8082"
cd ..
ngrok http --url=mullet-deep-explicitly.ngrok-free.app 8082