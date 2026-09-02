from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)

    # Firebase UID — populated on first Firebase login.
    # Nullable so that any existing rows remain valid during migration.
    firebase_uid = Column(String(255), unique=True, nullable=True, index=True)

    # Kept nullable for migration compatibility.
    # New Firebase-only accounts will have an empty string here.
    hashed_password = Column(String(255), nullable=True, default="")

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    datasets = relationship("Dataset", back_populates="owner", cascade="all, delete-orphan")
