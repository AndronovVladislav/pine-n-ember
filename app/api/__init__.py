from fastapi import APIRouter

from app.api.board import router as board_router
from app.api.finance import router as finance_router
from app.api.knowledge import router as knowledge_router

router = APIRouter(prefix='/api')
router.include_router(board_router)
router.include_router(knowledge_router)
router.include_router(finance_router)
