import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ppx-proxy',
      configureServer(server) {
        server.middlewares.use('/api/ppx/chat', async (req: IncomingMessage, res: ServerResponse, next) => {
          if (req.method !== 'POST') return next()
          try {
            type ChatRole = 'system' | 'user' | 'assistant' | 'tool'
            type ChatMessage = { role: ChatRole; content: string }
            type ProxyBody = {
              prompt?: string
              messages?: ChatMessage[]
              model?: string
              temperature?: number
              searchType?: 'pro' | 'auto' | 'fast'
              searchContextSize?: 'low' | 'medium' | 'high'
            }
            const body = await new Promise<ProxyBody>((resolve, reject) => {
              let data = ''
              req.on('data', (chunk) => { data += chunk })
              req.on('end', () => {
                try {
                  const parsed = data ? JSON.parse(data) as unknown : {}
                  resolve((parsed ?? {}) as ProxyBody)
                } catch (e) {
                  reject(e)
                }
              })
              req.on('error', reject)
            })

            const apiKey = process.env.PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY
            if (!apiKey) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing PERPLEXITY_API_KEY on server' }))
              return
            }

            const { default: Perplexity } = await import('@perplexity-ai/perplexity_ai')
            const client = new Perplexity({ apiKey })

            const messages: ChatMessage[] | null = Array.isArray(body?.messages) && body.messages.length > 0
              ? body.messages
              : (typeof body?.prompt === 'string' && body.prompt.trim())
                ? ([{ role: 'user' as ChatRole, content: String(body.prompt) }] as ChatMessage[])
                : null

            if (!messages) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Provide prompt or messages' }))
              return
            }

            const completion = await client.chat.completions.create({
              model: body?.model ?? 'sonar-pro',
              messages: messages as Array<{ role: ChatRole; content: string }>,
              stream: false,
              temperature: body?.temperature,
              web_search_options: {
                search_type: body?.searchType ?? 'pro',
                search_context_size: body?.searchContextSize,
              },
            })

            type CompletionMinimal = {
              choices?: Array<{ message?: { content?: string } }>
              usage?: {
                completion_tokens: number
                prompt_tokens: number
                total_tokens: number
                search_context_size?: string | null
                cost?: {
                  input_tokens_cost: number
                  output_tokens_cost: number
                  total_cost: number
                  request_cost?: number | null
                  search_queries_cost?: number | null
                  citation_tokens_cost?: number | null
                  reasoning_tokens_cost?: number | null
                }
              } | null
              search_results?: Array<{
                title: string
                url: string
                date?: string | null
                last_updated?: string | null
                snippet?: string
                source?: 'web' | 'attachment'
              }>
            }

            const cmp = completion as unknown as CompletionMinimal

            const text = (Array.isArray(cmp?.choices) ? cmp.choices : [])
              .map((c: { message?: { content?: string } }) => c?.message?.content)
              .filter(Boolean)
              .join('') || ''

            const payload = {
              text,
              usage: cmp?.usage ?? null,
              searchResults: cmp?.search_results ?? null,
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          } catch (err: unknown) {
            const message = (err && typeof err === 'object' && 'message' in err) ? String((err as { message?: string }).message) : 'Proxy error'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })
      },
    },
  ],
})
