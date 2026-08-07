import os

os.environ.setdefault("KORANCO_ENVIRONMENT", "test")
os.environ.setdefault(
    "KORANCO_DATABASE_URL",
    "postgresql+psycopg://koranco_dev:koranco_dev@localhost:5432/koranco_dev",
)
os.environ.setdefault("KORANCO_CORS_ORIGINS", "[]")
