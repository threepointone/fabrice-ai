import s from 'dedent'
import { zodFunction, zodResponseFormat } from 'openai/helpers/zod.js'
import { z } from 'zod'

import { openai, Provider } from './models.js'
import { WorkflowState } from './state.js'
import { Tool } from './tool.js'
import { Message } from './types.js'
import { Team } from './workflow.js'

export type AgentOptions = Partial<Agent>

export type Agent = {
  description?: string
  tools: {
    [key: string]: Tool
  }
  provider: Provider
  run: (state: WorkflowState, context: Message[], team: Team) => Promise<WorkflowState>
}

export const agent = (options: AgentOptions = {}): Agent => {
  const { description, tools = {}, provider = openai() } = options

  return {
    description,
    tools,
    provider,
    run:
      options.run ??
      (async (state, context) => {
        const mappedTools = tools
          ? Object.entries(tools).map(([name, tool]) =>
              zodFunction({
                name,
                parameters: tool.parameters,
                description: tool.description,
              })
            )
          : []

        const response = await provider.completions({
          messages: [
            {
              role: 'system',
              content: s`
              ${description}

              Your job is to complete the assigned task:
              - You can break down complex tasks into multiple steps if needed.
              - You can use available tools if needed.

              If tool requires arguments, get them from the input, or use other tools to get them.
              Do not fabricate or assume information not present in the input.

              Try to complete the task on your own.
            `,
            },
            {
              role: 'assistant',
              content: 'What have been done so far?',
            },
            {
              role: 'user',
              content: `Here is all the work done so far by other agents: ${JSON.stringify(context)}`,
            },
            {
              role: 'assistant',
              content: 'What do you want me to do now?',
            },
            ...state.messages,
          ],
          tools: mappedTools.length > 0 ? mappedTools : undefined,
          response_format: zodResponseFormat(
            z.object({
              response: z.discriminatedUnion('kind', [
                z.object({
                  kind: z.literal('step'),
                  name: z.string().describe('The name of the step'),
                  result: z.string().describe('The result of the step'),
                  reasoning: z.string().describe('The reasoning for this step'),
                  nextStep: z
                    .string()
                    .nullable()
                    .describe('The next step to complete the task, or null if task is complete'),
                }),
                z.object({
                  kind: z.literal('error'),
                  reasoning: z.string().describe('The reason why you cannot complete the task'),
                }),
              ]),
            }),
            'task_result'
          ),
        })

        if (response.choices[0].message.tool_calls.length > 0) {
          return {
            ...state,
            status: 'paused',
            messages: state.messages.concat(response.choices[0].message),
          }
        }

        const result = response.choices[0].message.parsed
        if (!result) {
          throw new Error('No parsed response received')
        }

        if (result.response.kind === 'error') {
          throw new Error(result.response.reasoning)
        }

        const agentResponse = {
          role: 'assistant' as const,
          content: result.response.result,
        }

        if (result.response.nextStep) {
          return {
            ...state,
            status: 'running',
            messages: [
              ...state.messages,
              agentResponse,
              {
                role: 'user',
                content: result.response.nextStep,
              },
            ],
          }
        }

        return {
          ...state,
          status: 'finished',
          messages: [agentResponse],
        }
      }),
  }
}
