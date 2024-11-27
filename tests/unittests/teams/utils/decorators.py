import pytest
import asyncio
from unittest.mock import AsyncMock, call
from fiftyone.utils.decorators import async_ttl_cache


@pytest.mark.asyncio
async def test_async_ttl_cache():
    # setup
    def x3(number: int) -> int:
        return number * 3

    mock_async_function = AsyncMock(side_effect=x3)
    mock_async_function.__name__ = "mock_async_function"
    cacheable_mock_async_function = async_ttl_cache(maxsize=3, ttl=1)(
        mock_async_function
    )
    expected_result = 3
    # cache create
    result = await cacheable_mock_async_function(1)
    mock_async_function.assert_called_once_with(1)
    assert result == expected_result
    # cache hit
    mock_async_function.reset_mock()
    result = await cacheable_mock_async_function(1)
    mock_async_function.assert_not_called()
    assert result == expected_result
    # cache miss due to ttl
    await asyncio.sleep(1)
    mock_async_function.reset_mock()
    result = await cacheable_mock_async_function(1)
    await asyncio.sleep(1)
    mock_async_function.assert_called_once_with(1)
    assert result == expected_result
    # cache miss due to maxsize
    await asyncio.sleep(1)
    mock_async_function.reset_mock()
    await cacheable_mock_async_function(1)
    await cacheable_mock_async_function(2)
    await cacheable_mock_async_function(3)
    await cacheable_mock_async_function(4)
    await cacheable_mock_async_function(1)
    mock_async_function.assert_has_calls(
        [call(1), call(2), call(3), call(4), call(1)]
    )
