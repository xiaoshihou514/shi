#set text(
  lang: "en",
  region: "us",
)

#set page(
  header: [
    #set text(10pt)
    #h(2fr) _Summary_
  ],
  numbering: "1 / 1",
)


#align(center, text(18pt)[ *Summary* ])
#let url(dest, body) = {
  link(
    dest,
    underline(text(body, fill: rgb("#1F656D"))),
  )
}


#set text(size: 14pt)
- Lei Ye \<ky723\@ic.ac.uk\> #url("https://www.linkedin.com/in/lei-ye-1013b3388/", [Linkedin])
- Yuhan Wang \<yw8123\@ic.ac.uk\> #url("https://www.linkedin.com/in/yuhan-wang-5546832a2/", [Linkedin])

#set text(size: 8pt)
_\*Both authors contributed equally to the project, and are thus ranked by alphabetical order._
#set text(size: 14pt)

*SHI (Spatial History Intelligence)* is an interactive, human-centered platform that transforms global exploration into an intelligent, story-driven experience. Its purpose is to make the world’s geographic and historical knowledge accessible through an intuitive map interface powered by AI. By clicking anywhere on the map, users can instantly uncover the history, culture, and significance of that place, explore correlated regions, visualize the life traces of notable figures, and compare countries across AI-derived metrics — all within a seamless visual environment.

Technically, SHI integrates *geospatial visualization* with *AI reasoning and retrieval* via the *Perplexity API*. When a user selects a location, SHI formulates a structured query containing spatial and contextual metadata. Perplexity’s engine then performs *retrieval-augmented generation (RAG)* — gathering reliable, real-time information from multiple sources and synthesizing it into coherent, human-readable insights. The system parses and visualizes these responses dynamically, creating an adaptive interface where users can interact with evolving narratives rather than static data.

The use of Perplexity’s reasoning and retrieval capabilities makes SHI uniquely innovative. Its *semantic understanding* connects related geographic areas, revealing historical, cultural, or thematic correlations that traditional maps cannot. By grounding AI-generated knowledge in spatial context, SHI fosters *human-centered discovery* — enabling users to see not just where things happened, but *why* they matter and how they interconnect. This fusion of AI, geography, and storytelling redefines how people learn about the world — turning maps into living, intelligent reflections of human history.
