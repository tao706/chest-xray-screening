from threading import BoundedSemaphore


class InferenceBusy(RuntimeError):
    pass


class InferenceSlots:
    def __init__(self, limit=0):
        self.semaphore = BoundedSemaphore(limit) if limit > 0 else None

    def run(self, operation, *args):
        if self.semaphore is None:
            return operation(*args)
        if not self.semaphore.acquire(blocking=False):
            raise InferenceBusy('分析服务繁忙，请稍后重试。')
        try:
            return operation(*args)
        finally:
            self.semaphore.release()
