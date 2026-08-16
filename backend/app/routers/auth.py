from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AdminUser
from ..ratelimit import rate_limit
from ..schemas import AdminOut, LoginRequest
from ..security import COOKIE_NAME, create_access_token, get_current_admin, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

IS_PROD = settings.public_origin.startswith("https")


@router.post(
    "/login",
    response_model=AdminOut,
    dependencies=[Depends(rate_limit("login", max_hits=8, window_seconds=300))],
)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.username == payload.username).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")

    token = create_access_token(admin.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=IS_PROD,
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return AdminOut(username=admin.username)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=AdminOut)
def me(username: str = Depends(get_current_admin)):
    return AdminOut(username=username)
