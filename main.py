import uvicorn

from app.bootstrap import build_app
from app.settings import settings

app = build_app()

if __name__ == '__main__':
    uvicorn.run('main:app', host=settings.HOST, port=settings.PORT, reload=True)
