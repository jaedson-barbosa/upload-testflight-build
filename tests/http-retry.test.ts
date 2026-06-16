import {beforeEach, describe, expect, it, vi} from 'vitest'
import {fetchJson} from '../src/utils/http'

const fetchMock = vi.fn()

global.fetch = fetchMock

describe('fetchJson retries', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('retries on retryable status codes and eventually succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(makeResponse(502, 'Bad Gateway'))
      .mockResolvedValueOnce(makeJsonResponse({ok: true}))

    const result = await fetchJson('/test', () => 'token', 'error')

    expect(result).toEqual({ok: true})
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    fetchMock.mockResolvedValue(makeResponse(503, 'Service Unavailable'))

    await expect(
      fetchJson('/test', () => 'token', 'error', 'GET', undefined, undefined, {
        retries: 1,
        baseDelayMs: 1,
        factor: 1
      })
    ).rejects.toThrow()

    // retries=1 allows 2 total attempts; ensure no extra calls occurred
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on 401 and calls token factory fresh each time', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(401, 'Unauthorized'))
      .mockResolvedValueOnce(makeJsonResponse({ok: true}))

    let callCount = 0
    const getToken = () => {
      callCount++
      return `token-${callCount}`
    }

    const result = await fetchJson('/test', getToken, 'error', 'GET', undefined, undefined, {
      retries: 1,
      baseDelayMs: 1,
      factor: 1
    })

    expect(result).toEqual({ok: true})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Token factory called once per attempt
    expect(callCount).toBe(2)
    // Second attempt used a fresh token
    const secondCallHeaders = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>
    expect(secondCallHeaders['Authorization']).toBe('Bearer token-2')
  })
})

function makeResponse(status: number, statusText: string): Response {
  return new Response('fail', {status, statusText})
}

function makeJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {'content-type': 'application/json'}
  })
}
