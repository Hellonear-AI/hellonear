// A `count` beside every list a read tool returns (#264), so a Builder If can compare "Number of events > 0": an If
// compares one number or text, and Mastra validates its path against the step's output schema, where an array has no
// `length`. `withCount` adds `count` to the tool's output schema and fills it from the list after the tool's own
// execute, whichever return path it took (sample data, real app, empty).
import { z } from 'zod'

type Config<I extends z.ZodTypeAny, O extends z.ZodObject<z.ZodRawShape>> = {
  inputSchema: I
  outputSchema: O
  execute: (input: z.infer<I>, context: any) => Promise<any>
}

export function withCount<I extends z.ZodTypeAny, O extends z.ZodObject<z.ZodRawShape>, C extends Config<I, O>>(field: string, config: C & Config<I, O>) {
  const execute = config.execute
  return {
    ...config,
    outputSchema: config.outputSchema.extend({ count: z.number().describe(`how many ${field} came back`) }),
    execute: async (input: z.infer<I>, context: any) => {
      const out = await execute(input, context)
      if (!out || typeof out !== 'object' || 'error' in out) return out
      const list = (out as Record<string, unknown>)[field]
      return { ...out, count: Array.isArray(list) ? list.length : 0 }
    },
  }
}
