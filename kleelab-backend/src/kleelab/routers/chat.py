"""Public enquiry chat for visitors to the marketing site."""

from fastapi import APIRouter

from kleelab.services.enquiry_chat import ChatReply, ChatRequest, answer

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatReply)
async def chat(payload: ChatRequest) -> ChatReply:
    """Answer the visitor's latest message.

    Stateless: the browser sends the conversation each time, and nothing is stored.
    A visitor who wants to be contacted submits a lead, which is stored.
    """

    return await answer(payload)
