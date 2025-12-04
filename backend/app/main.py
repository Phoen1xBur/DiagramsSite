from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from app.api.v1 import router as api_router
from app.core.config import settings

app = FastAPI(
    title="Sunburst Diagram API",
    description="API for creating and managing sunburst diagrams",
    version="1.0.0"
)

# Настройка OAuth2 для документации
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Sunburst Diagram API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

