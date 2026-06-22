backend:
	cd backend && uvicorn app.main:app --reload

frontend:
	cd frontend && npm run dev

test:
	cd backend && pytest

lint:
	cd backend && flake8

format:
	cd backend && black .