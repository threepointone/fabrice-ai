import type { ParsedChatCompletionMessage } from 'openai/resources/beta/chat/completions'
import { ChatCompletionToolMessageParam } from 'openai/resources/chat/completions'
import z, { ZodTypeAny } from 'zod'

import { Provider } from './models.js'
import { Message } from './types.js'

export type Tool<P extends ZodTypeAny = any> = {
  description: string
  parameters: P
  execute: (
    parameters: z.infer<P>,
    context: { provider: Provider; messages: Message[] }
  ) => Promise<string>
}

/**
 * Helper function to infer the type of the parameters.
 */
export const tool = <P extends ZodTypeAny>(tool: Tool<P>): Tool<P> => tool

/**
 * Asserts that given message requests tool calls
 */
export function isToolCallRequest(message?: Message): message is ParsedChatCompletionMessage<any> {
  return message ? 'tool_calls' in message : false
}

export async function runTools(
  agent: Agent,
  agentRequest: Message[]
): Promise<ChatCompletionToolMessageParam[]> {
  // tbd: find cleaner way to do this
  const messages = Array.from(agentRequest)
  const toolCallRequest = messages.pop()

  if (!isToolCallRequest(toolCallRequest)) {
    throw new Error('Invalid tool request')
  }

  const toolResults = await Promise.all(
    toolCallRequest.tool_calls.map(async (toolCall) => {
      if (toolCall.type !== 'function') {
        throw new Error('Tool call is not a function')
      }

      const tool = agent.tools ? agent.tools[toolCall.function.name] : null
      if (!tool) {
        throw new Error(`Unknown tool: ${toolCall.function.name}`)
      }

      const content = await tool.execute(toolCall.function.parsed_arguments, {
        provider: agent.provider,
        messages,
      })
      return {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: JSON.stringify(content),
      }
    })
  )

  return toolResults
}
