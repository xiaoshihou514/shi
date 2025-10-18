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
    mediaResponse?: Record<string, unknown>
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
export async function proSearchText(params: StreamProSearchParams & { signal?: AbortSignal }): Promise<{
    text: string
    usage: ProSearchStreamItem['usage']
    searchResults: ProSearchStreamItem['searchResults']
    media: unknown
}> {
    const {
        prompt,
        messages,
        model = 'sonar-pro',
        temperature,
        searchType = 'pro',
        searchContextSize,
        mediaResponse,
        signal,
    } = params

    const payload = {
        prompt,
        messages,
        model,
        temperature,
        searchType,
        searchContextSize,
        media_response: mediaResponse,
    }

    const resp = await fetch('/api/ppx/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        signal,
    })
    if (!resp.ok) {
        const msg = await safeReadText(resp)
        throw new Error(msg || `PPX request failed: HTTP ${resp.status}`)
    }
    const data = await resp.json().catch(() => ({})) as {
        text?: string
        usage?: ProSearchStreamItem['usage']
        searchResults?: ProSearchStreamItem['searchResults']
        media?: unknown
    }
    return {
        text: typeof data.text === 'string' ? data.text : '',
        usage: data.usage ?? null,
        searchResults: data.searchResults ?? null,
        media: data.media ?? null,
    }
}

export type LocationMedia = {
    url: string
    caption?: string
}

export async function fetchLocationMedia(locationName: string, signal?: AbortSignal): Promise<LocationMedia[]> {
    const prompt = `cityscape of ${locationName}`;

    const resp = await fetch('/api/ppx/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            mediaOverrides: {
                return_images: true,
            },
        }),
        signal,
    })

    if (!resp.ok) {
        const msg = await safeReadText(resp)
        throw new Error(msg || `Media request failed: HTTP ${resp.status}`)
    }

    const result = await resp.json();
    return (result.images as Array<{ image_url: string; title: string }>).map(e => ({
        url: e.image_url,
        caption: e.title,
    }));
}

export async function findCityWithPPX(params: {
    displayName?: string | null
    address?: Record<string, string> | null
    name?: string | null
}): Promise<{ city?: string; detailedName?: string } | null> {
    const {displayName = null, address = null, name = null} = params ?? {};
    const payload = {
        display: typeof displayName === 'string' ? displayName : '',
        address: address ?? {},
        name: typeof name === 'string' ? name : '',
    };
    try {
        const prompt = [
            'Task: Extract the best city-level name for the given location input and output it in English (en).',
            'Rules:',
            '- Prefer city-level entities over states or countries.',
            '- If input is already English, keep it; otherwise translate to English.',
            '- Avoid street-level details; keep names concise (<= 2 comma-separated parts).',
            'Return STRICT JSON only in the form: {"city": string, "detailedName": string}.',
            '- "city": the concise city-level name in English.',
            '- "detailedName": an English, human-readable display name derived from display_name/address.',
            `input_name: ${payload.name}`,
            `input_display_name: ${payload.display}`,
            `input_address_json: ${JSON.stringify(payload.address)}`,
        ].join('\n');
        const {text} = await normalSearchText({prompt, searchType: 'fast'});

        const tryParseObject = (t: string): unknown => {
            try {
                return JSON.parse(t);
            } catch {
                const first = t.indexOf('{');
                const last = t.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                    try {
                        return JSON.parse(t.slice(first, last + 1));
                    } catch { /* no-op */
                    }
                }
                return null;
            }
        };
        const parsed = tryParseObject(text);
        if (parsed && typeof parsed === 'object' && parsed !== null) {
            const obj = parsed as { city?: unknown; detailedName?: unknown };
            const cityVal = obj.city;
            const detailedNameVal = obj.detailedName;
            if (typeof cityVal === 'string' && typeof detailedNameVal === 'string') {
                const cityTrimmed = cityVal.trim();
                const detailedNameTrimmed = detailedNameVal.trim();
                if (cityTrimmed.length > 0 && detailedNameTrimmed.length > 0) return {
                    city: cityTrimmed,
                    detailedName: detailedNameTrimmed
                };
            }
        }
        return null;
    } catch {
        return null;
    }
}

export async function normalSearchText(params: StreamProSearchParams & { signal?: AbortSignal }): Promise<{
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

// ------------------------
// Person Life Path helpers
// ------------------------

export type SourceRef = {
    title: string
    url: string
}

export type LifeHop = {
    city: string
    startDate?: string
    endDate?: string
    description?: string
    sources?: SourceRef[]
}

function normalizeDateLike(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const v = input.trim();
    if (!v) return undefined;
    // Accept YYYY, YYYY-MM, YYYY-MM-DD — do not force ISO; UI can display raw
    // Validate basic pattern
    const ok = /^(\d{4})(-(0[1-9]|1[0-2]))?(-(0[1-9]|[12]\d|3[01]))?$/.test(v);
    return ok ? v : undefined;
}

function takeFirstJsonArray(text: string): unknown[] | null {
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed as unknown[];
    } catch { /* fallthrough */ }
    const a = text.indexOf('[');
    const b = text.lastIndexOf(']');
    if (a !== -1 && b !== -1 && b > a) {
        try {
            const parsed = JSON.parse(text.slice(a, b + 1));
            if (Array.isArray(parsed)) return parsed as unknown[];
        } catch { /* ignore */ }
    }
    return null;
}

function coerceLifeHops(rawArr: unknown[]): LifeHop[] {
    const hops: LifeHop[] = [];
    for (const it of rawArr) {
        const obj = (it ?? {}) as Record<string, unknown>;
        const cityRaw = obj['city'];
        const startRaw = obj['start_date'] ?? obj['startDate'];
        const endRaw = obj['end_date'] ?? obj['endDate'];
        const descRaw = obj['description'] ?? obj['summary'] ?? obj['activity'];
        const sourcesRaw = obj['sources'];
        const city = typeof cityRaw === 'string' ? cityRaw.trim() : '';
        if (!city) continue;
        const hop: LifeHop = {
            city,
            startDate: normalizeDateLike(startRaw),
            endDate: normalizeDateLike(endRaw),
            description: typeof descRaw === 'string' ? descRaw.trim() : undefined,
            sources: Array.isArray(sourcesRaw)
                ? (sourcesRaw as unknown[]).map((s) => {
                      const so = (s ?? {}) as Record<string, unknown>;
                      const title = typeof so['title'] === 'string' ? so['title'].trim() : '';
                      const url = typeof so['url'] === 'string' ? so['url'].trim() : '';
                      return (title || url) ? { title, url } : null;
                  }).filter(Boolean) as SourceRef[]
                : undefined,
        };
        hops.push(hop);
    }
    // Remove consecutive duplicates (case-insensitive, trimmed)
    const dedup: LifeHop[] = [];
    for (const h of hops) {
        const prev = dedup[dedup.length - 1];
        if (prev && prev.city.trim().toLowerCase() === h.city.trim().toLowerCase()) continue;
        dedup.push(h);
    }
    return dedup;
}

export async function fetchPersonLifePath(personName: string, signal?: AbortSignal): Promise<LifeHop[]> {
    const name = (personName ?? '').trim();
    if (!name) return [];
    const prompt = [
        `Task: Output a chronological sequence of major city-to-city moves for the famous person below.`,
        `Return STRICT JSON only: an array where each item is {` +
            `"city": string (in format cityname, regionname, countryname), "start_date": string|null, "end_date": string|null, "description": string (1-2 sentences),` +
            `"sources"?: [{"title": string, "url": string}] }`,
        `Rules:`,
        `- City names must be in English.`,
        `- No consecutive duplicate cities (allow revisits later in the array).`,
        `- Include major relocations or multi-year stays or birth cities and death cities; omit trivial short trips.`,
        `- Dates may be YYYY or YYYY-MM or YYYY-MM-DD when precise; use null if unknown.`,
        `- Keep it concise (10-15 hops).`,
        `Person: ${name}`
    ].join('\n');

    const { text } = await proSearchText({ prompt, searchType: 'pro', signal });
    const arr = takeFirstJsonArray(text);
    if (!arr) return [];
    return coerceLifeHops(arr);
}
