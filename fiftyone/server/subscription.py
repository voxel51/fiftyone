from typing import AsyncGenerator

import asyncio
import strawberry as gql


@gql.type
class Subscription:
    @gql.subscription
    async def tick(self) -> AsyncGenerator[int, None]:
        i = 0
        while True:
            yield i
            i += 1
            await asyncio.sleep(10)
