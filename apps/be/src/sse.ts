// Parses the engine's SSE stream (one JSON event per `data:` line, events separated by a blank line).
// Network chunks can split an event anywhere, so lines are buffered until complete.
export async function* sseEvents(body: AsyncIterable<Uint8Array>): AsyncGenerator<Record<string, any>> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      if (line.startsWith('data: ')) yield JSON.parse(line.slice(6))
    }
  }
  buffer += decoder.decode()
  if (buffer.startsWith('data: ')) yield JSON.parse(buffer.slice(6))
}
