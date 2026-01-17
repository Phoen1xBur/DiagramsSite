from fastapi import APIRouter
from app.api.v1 import files, charts, diagrams, auth, projects, admin

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(projects.router, prefix="/projects", tags=["projects"])
router.include_router(files.router, prefix="/files", tags=["files"])
router.include_router(charts.router, prefix="/charts", tags=["charts"])
router.include_router(diagrams.router, prefix="/diagrams", tags=["diagrams"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])

