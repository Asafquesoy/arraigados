import os
import uuid

from fastapi import HTTPException, UploadFile, status

from .config import settings

ALLOWED_MIME_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def _sniff_mime(head: bytes, fallback: str) -> str:
    try:
        import magic

        detected = magic.from_buffer(head, mime=True)
        return detected or fallback
    except Exception:
        return fallback


async def save_ticket(upload: UploadFile) -> tuple[str, str]:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await upload.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"El archivo supera el límite de {settings.max_upload_mb}MB",
        )

    mime = _sniff_mime(content[:2048], upload.content_type or "")
    ext = ALLOWED_MIME_EXT.get(mime)
    if not ext:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Formato de comprobante no permitido. Usa JPG, PNG, WEBP o PDF.",
        )

    os.makedirs(settings.tickets_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.tickets_dir, filename)
    with open(path, "wb") as f:
        f.write(content)

    return filename, mime
