import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_hits: dict[str, list[float]] = defaultdict(list)


def rate_limit(key_prefix: str, max_hits: int, window_seconds: int):
    def _dep(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        key = f"{key_prefix}:{client_ip}"
        now = time.time()
        window_start = now - window_seconds
        hits = [t for t in _hits[key] if t > window_start]
        if len(hits) >= max_hits:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Demasiados intentos. Intenta de nuevo en unos minutos.",
            )
        hits.append(now)
        _hits[key] = hits

    return _dep
