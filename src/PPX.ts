// utils for calling perplexity apis

import Perplexity from '@perplexity-ai/perplexity_ai'

export type ProSearchStreamItem = {
  content?: string
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
  searchResults?: Array<{
    title: string
    url: string
    date?: string | null
    last_updated?: string | null
    snippet?: string
    source?: 'web' | 'attachment'
  }> | null
  // Full raw chunk for advanced consumers
  raw?: unknown
}

export type PPXClient = InstanceType<typeof Perplexity>

export function createPerplexityClient(apiKey?: string): PPXClient {
  const resolvedKey = apiKey ?? (globalThis as unknown as { PERPLEXITY_API_KEY?: string }).PERPLEXITY_API_KEY
  if (!resolvedKey) throw new Error('Missing Perplexity API key. Set PERPLEXITY_API_KEY on globalThis.')
  return new Perplexity({ apiKey: resolvedKey })
}

export type StreamProSearchParams = {
  prompt?: string
  messages?: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  apiKey?: string
  model?: string
  temperature?: number
  // 'pro' enforces Pro Search; 'auto' lets the model decide; 'fast' is cheaper
  searchType?: 'pro' | 'auto' | 'fast'
  searchContextSize?: 'low' | 'medium' | 'high'
}

// Async generator that yields content tokens and metadata from Sonar Pro with Pro Search
export async function* streamProSearch(
  params: StreamProSearchParams
): AsyncGenerator<ProSearchStreamItem> {
  const {
    prompt,
    messages,
    apiKey,
    model = 'sonar-pro',
    temperature,
    searchType = 'pro',
    searchContextSize,
  } = params

  const client = createPerplexityClient(apiKey)

  const msgs = messages ?? (prompt ? [{ role: 'user' as const, content: prompt }] : [])
  if (msgs.length === 0) {
    throw new Error('Provide either prompt or messages')
  }

  const response = await client.chat.completions.create({
    model,
    messages: msgs,
    stream: true,
    temperature,
    web_search_options: {
      search_type: searchType,
      search_context_size: searchContextSize,
    },
    // request full stream (includes usage/info events)
    stream_mode: 'full',
  })

  // SDK returns an async iterable of chunks
  for await (const chunk of response as AsyncIterable<Perplexity.StreamChunk> as unknown as AsyncIterable<Perplexity.StreamChunk>) {
    const delta = chunk?.choices?.[0]?.delta
    // content can be a string or a structured array; handle string primarily
    const content: string | undefined = typeof delta?.content === 'string' ? delta.content : undefined
    yield {
      content,
      usage: chunk?.usage ?? null,
      searchResults: chunk?.search_results ?? null,
      raw: chunk,
    }
  }
}

export type StreamToCallbacksParams = StreamProSearchParams & {
  onToken?: (text: string) => void
  onInfo?: (info: Omit<ProSearchStreamItem, 'content'> & { content?: undefined }) => void
}

// Convenience: stream and emit tokens via callbacks
export async function streamProSearchToCallbacks(params: StreamToCallbacksParams): Promise<void> {
  const { onToken, onInfo, ...rest } = params
  for await (const item of streamProSearch(rest)) {
    if (item.content && onToken) onToken(item.content)
    else if (!item.content && onInfo) onInfo({ usage: item.usage ?? null, searchResults: item.searchResults ?? null, raw: item.raw })
  }
}

// One-shot helper: returns the full text by concatenating streamed tokens
export async function proSearchText(params: StreamProSearchParams): Promise<{
  text: string
  usage: ProSearchStreamItem['usage']
  searchResults: ProSearchStreamItem['searchResults']
}> {
  let text = ''
  let usage: ProSearchStreamItem['usage'] = null
  let searchResults: ProSearchStreamItem['searchResults'] = null
  for await (const item of streamProSearch(params)) {
    if (item.content) text += item.content
    if (item.usage) usage = item.usage
    if (item.searchResults) searchResults = item.searchResults
  }
  return { text, usage, searchResults }
}

// Minimal example usage:
// await streamProSearchToCallbacks({
//   prompt: 'Analyze the latest developments in quantum computing and their impact on cryptography.',
//   searchType: 'pro',
//   onToken: (t) => console.log(t),
// })
