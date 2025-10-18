# SHI: Spatial Historical Intelligence

|                                           Discovery                                           |                                           Connections                                           |
| :-------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------: |
| ![Discovery](https://github.com/user-attachments/assets/3dd1d519-c590-431e-a880-73fecfcb2965) | ![Connections](https://github.com/user-attachments/assets/2457c487-bd14-4368-99c7-208baf107eb4) |
|                                        Celebrity paths                                        |                                       Data Visualization                                        |
|  ![Celebp](https://github.com/user-attachments/assets/c1a9b115-4c59-4339-bc6d-38c3494a6662)   |   ![Dataviz](https://github.com/user-attachments/assets/0733ba25-7bde-4491-beea-39e2b8744673)   |

**SHI** is an interactive, AI-driven map visualization platform that transforms the way people explore and understand the world.
By simply clicking anywhere on the map, users can instantly learn about a location’s **history, culture, and significance**, powered by an integrated **AI search engine (Perplexity API)**.

Beyond individual exploration, SHI enables users to:

- **Visualize correlations** between different geographic areas.
- **Trace the life journeys of notable figures** across the world.
- **Compare countries** on various **AI-derived metrics** such as economy, culture, innovation, and more.

## Why?

- **Intuitive Discovery:** Learn about any place on Earth without needing to search manually.
- **AI-Driven Insights:** Go beyond static data — get contextually rich, up-to-date narratives about regions.
- **Global Perspective:** Discover interconnections between distant areas through correlation mapping.
- **Analytical Comparison:** Compare nations dynamically on metrics derived from the AI engine’s real-world knowledge.

SHI bridges **geospatial visualization** and **AI-powered contextual understanding** in a single platform.
Instead of relying on pre-collected datasets or static APIs, SHI leverages **Perplexity’s AI search engine** to dynamically gather, synthesize, and summarize information in real time — turning raw geographic clicks into **meaningful, data-rich storytelling experiences**.

## Integration with Perplexity

SHI integrates **Perplexity’s API** as its core intelligence layer.
When a user selects a region, the backend sends a structured query to Perplexity, which returns context-aware results — such as the location’s historical background, key figures, cultural relevance, and statistical comparisons.
This response is then parsed, visualized, and connected to other relevant geographic entities through our custom correlation engine.

## Setup

- Node.js 18+ (recommended) and npm.
- Perplexity API key with access to Sonar Pro search.

```shell
npm i
env PERPLEXITY_API_KEY=pplx-abc npm run dev
# optionally
npm run build
npm run preview
```
