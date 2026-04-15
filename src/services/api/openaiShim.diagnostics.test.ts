import { afterEach, expect, mock, test } from 'bun:test'

const originalFetch = globalThis.fetch
const originalEnv = {
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
}

afterEach(() => {
  globalThis.fetch = originalFetch
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
  mock.restore()
})

test('logs classified transport diagnostics with category and code', async () => {
  const debugSpy = mock(() => {})
  mock.module('../../utils/debug.js', () => ({
    logForDebugging: debugSpy,
  }))

  const nonce = `${Date.now()}-${Math.random()}`
  const { createOpenAIShimClient } = await import(`./openaiShim.ts?ts=${nonce}`)

  process.env.OPENAI_BASE_URL = 'http://localhost:11434/v1'
  process.env.OPENAI_API_KEY = 'ollama'

  const transportError = Object.assign(new TypeError('fetch failed'), {
    code: 'ECONNREFUSED',
  })

  globalThis.fetch = mock(async () => {
    throw transportError
  }) as typeof globalThis.fetch

  const client = createOpenAIShimClient({}) as {
    beta: {
      messages: {
        create: (params: Record<string, unknown>) => Promise<unknown>
      }
    }
  }

  await expect(
    client.beta.messages.create({
      model: 'qwen2.5-coder:7b',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 64,
      stream: false,
    }),
  ).rejects.toThrow('openai_category=localhost_resolution_failed')

  const transportLog = debugSpy.mock.calls.find(call =>
    typeof call?.[0] === 'string' && call[0].includes('transport failure'),
  )

  expect(transportLog).toBeDefined()
  expect(String(transportLog?.[0])).toContain('category=localhost_resolution_failed')
  expect(String(transportLog?.[0])).toContain('code=ECONNREFUSED')
  expect(transportLog?.[1]).toEqual({ level: 'warn' })
})
