from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ChatConversation(Base):
    """
    One persistent chat session per user.
    Title is auto-generated from the first message.
    """
    __tablename__ = "chat_conversations"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title       = Column(String(255), nullable=False, default="New Conversation")
    dataset_id  = Column(Integer, ForeignKey("datasets.id"), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )
    user    = relationship("User")
    dataset = relationship("Dataset", foreign_keys=[dataset_id])

    __table_args__ = (
        Index("ix_chat_conv_user_updated", "user_id", "updated_at"),
    )


class ChatMessage(Base):
    """A single message (user or assistant) inside a conversation."""
    __tablename__ = "chat_messages"

    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("chat_conversations.id"), nullable=False, index=True
    )
    role            = Column(String(20), nullable=False)   # "user" | "assistant"
    content         = Column(Text, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("ChatConversation", back_populates="messages")
