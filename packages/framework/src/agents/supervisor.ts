import s from 'dedent'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { agent, AgentOptions } from '../agent.js'
import { workflowState } from '../state.js'

const defaults: AgentOptions = {
  run: async (state, context, team) => {
    const response = await team[state.agent].provider.completions({
      messages: [
        {
          role: 'system',
          content: s`
            You are a planner that breaks down complex workflows into smaller, actionable steps.
            Your job is to determine the next task that needs to be done based on the original workflow and what has been completed so far.
            If all required tasks are completed, return null.

            Rules:
            1. Each task should be self-contained and achievable
            2. Tasks should be specific and actionable
            3. Return null when the workflow is complete
            4. Consider dependencies and order of operations
            5. Use context from completed tasks to inform next steps
          `,
        },
        {
          role: 'assistant',
          content: 'What is the request?',
        },
        ...context,
        ...state.messages,
      ],
      temperature: 0.2,
      response_format: zodResponseFormat(
        z.object({
          task: z
            .string()
            .describe('The next task to be completed or null if the workflow is complete')
            .nullable(),
          reasoning: z
            .string()
            .describe('The reasoning for selecting the next task or why the workflow is complete'),
        }),
        'next_task'
      ),
    })

    try {
      const content = response.choices[0].message.parsed
      if (!content) {
        throw new Error('No content in response')
      }

      if (!content.task) {
        return {
          ...state,
          status: 'finished',
        }
      }

      const agentRequest = {
        role: 'user' as const,
        content: content.task,
      }

      return {
        ...state,
        status: 'running',
        messages: [...state.messages, agentRequest],
        child: workflowState({
          agent: 'resourcePlanner',
          messages: [agentRequest],
        }),
      }
    } catch (error) {
      throw new Error('Failed to determine next task')
    }
  },
}

export const supervisor = (options?: AgentOptions) =>
  agent({
    ...defaults,
    ...options,
  })
