// utils for calling perplexity apis via local dev proxy (avoids browser CORS)

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

// Note: No direct SDK usage in the browser. Calls are proxied to `/api/ppx/chat`.

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
    // Non-stream fallback in browser: call one-shot and yield once
    const {text, usage, searchResults} = await proSearchText(params)
    yield {content: text, usage, searchResults}
}

export type StreamToCallbacksParams = StreamProSearchParams & {
    onToken?: (text: string) => void
    onInfo?: (info: Omit<ProSearchStreamItem, 'content'> & { content?: undefined }) => void
}

// Convenience: stream and emit tokens via callbacks
export async function streamProSearchToCallbacks(params: StreamToCallbacksParams): Promise<void> {
    const {onToken, onInfo, ...rest} = params
    for await (const item of streamProSearch(rest)) {
        if (item.content && onToken) onToken(item.content)
        else if (!item.content && onInfo) onInfo({
            usage: item.usage ?? null,
            searchResults: item.searchResults ?? null,
            raw: item.raw
        })
    }
}

// One-shot helper: returns the full text by concatenating streamed tokens
export async function proSearchText(params: StreamProSearchParams): Promise<{
    text: string
    usage: ProSearchStreamItem['usage']
    searchResults: ProSearchStreamItem['searchResults']
}> {
    const {
        prompt,
        messages,
        model = 'sonar-pro',
        temperature,
        searchType = 'pro',
        searchContextSize,
    } = params

    const payload = {
        prompt,
        messages,
        model,
        temperature,
        searchType,
        searchContextSize,
    }

    const resp = await fetch('/api/ppx/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
    })
    if (!resp.ok) {
        const msg = await safeReadText(resp)
        throw new Error(msg || `PPX request failed: HTTP ${resp.status}`)
    }
    const data = await resp.json().catch(() => ({})) as {
        text?: string
        usage?: ProSearchStreamItem['usage']
        searchResults?: ProSearchStreamItem['searchResults']
    }
    return {
        text: typeof data.text === 'string' ? data.text : '',
        usage: data.usage ?? null,
        searchResults: data.searchResults ?? null,
    }
}

export async function translatePOI(name: string): Promise<{
    text: string
    usage: ProSearchStreamItem['usage']
    searchResults: ProSearchStreamItem['searchResults']
}> {
    return proSearchText({
        prompt: [
            'You are a professional translator. For the city below, translate it to English if not already so.',
            `City: ${name}`,
        ].join('\n'),
        searchType: 'fast',
    })
}

export async function normalSearchText(params: StreamProSearchParams): Promise<{
    text: string
    usage: ProSearchStreamItem['usage']
    searchResults: ProSearchStreamItem['searchResults']
}> {
    return proSearchText({...params, searchType: 'fast'})
}

async function safeReadText(resp: Response): Promise<string> {
    try {
        return await resp.text()
    } catch {
        return ''
    }
}

// Minimal example usage:
// await streamProSearchToCallbacks({
//   prompt: 'Analyze the latest developments in quantum computing and their impact on cryptography.',
//   searchType: 'pro',
//   onToken: (t) => console.log(t),
// })
