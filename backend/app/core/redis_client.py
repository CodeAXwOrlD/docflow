import redis.asyncio as aioredis
import redis as sync_redis
from app.core.config import settings

_async_redis_client = None
_sync_redis_client = None


async def get_async_redis():
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _async_redis_client


def get_sync_redis():
    global _sync_redis_client
    if _sync_redis_client is None:
        _sync_redis_client = sync_redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _sync_redis_client


def publish_progress(job_id: str, event: str, progress: int, message: str, data: dict = None):
    """Publish progress event via Redis Pub/Sub from sync worker context."""
    import json
    r = get_sync_redis()
    payload = {
        "job_id": job_id,
        "event": event,
        "progress": progress,
        "message": message,
        "data": data or {}
    }
    r.publish(f"job_progress:{job_id}", json.dumps(payload))
    # Also store latest status in Redis hash for polling
    r.hset(f"job_status:{job_id}", mapping={
        "event": event,
        "progress": str(progress),
        "message": message,
    })
    r.expire(f"job_status:{job_id}", 3600)
