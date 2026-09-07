from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.user import User
from kleelab.services.upsell import check_feature_access


def require_feature(feature_name: str):
    """Return a FastAPI dependency that 402s if the current user's plan lacks this feature.

    Usage: add `dependencies=[Depends(require_feature("custom_domain"))]` to the
    route decorator. Do not use this as a function decorator on the route itself.
    """

    async def checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        access = await check_feature_access(feature_name, user.id, db)
        if not access["has_access"]:
            raise HTTPException(status_code=402, detail=access)
        return user

    return checker