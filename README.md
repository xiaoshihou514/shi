# SHI: Spatial Historical Intelligence

## PPX: Perplexity Pro Search (Sonar Pro)

Utilities for Pro Search with Sonar Pro live in `src/PPX.ts`.

### Stream tokens (async generator)

```ts
import { streamProSearch } from "./src/PPX";

async function run() {
  for await (const item of streamProSearch({
    prompt:
      "Analyze the latest developments in quantum computing and their impact on cryptography.",
    searchType: "pro", // 'pro' | 'auto' | 'fast'
  })) {
    if (item.content) {
      process.stdout.write(item.content);
    }
    // item.usage and item.searchResults arrive as the stream progresses
  }
}

run();
```

### Stream with callbacks

```ts
import { streamProSearchToCallbacks } from "./src/PPX";

await streamProSearchToCallbacks({
  prompt:
    "Analyze the latest developments in quantum computing and their impact on cryptography.",
  searchType: "pro",
  onToken: (t) => process.stdout.write(t),
  onInfo: (info) => console.log("info:", info.usage ?? info.searchResults),
});
```

### One-shot: collect full text

```ts
import { proSearchText } from "./src/PPX";

const { text, usage, searchResults } = await proSearchText({
  prompt:
    "Analyze the latest developments in quantum computing and their impact on cryptography.",
  searchType: "pro",
});

console.log(text);
console.log(usage);
console.log(searchResults);
```

Notes:

- Default model is `sonar-pro`.
- Functions: `streamProSearch`, `streamProSearchToCallbacks`, `proSearchText`.
- `usage` and `searchResults` are exposed from the streamed chunks; the raw chunk is available on the generator items via `raw`.
