import s from 'dedent'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { agent, AgentOptions } from '../agent.js'
import { finish, request, response } from '../state.js'

const defaults: AgentOptions = {
  run: async (state, context, workflow) => {
    const res = await workflow.team[state.agent].provider.completions({
      messages: [
        {
          role: 'system',
          content: s`
            You exceeded max steps.
          `,
        },
        ...context,
        request(s`
          Please summarize all executed steps and do your best to achieve 
          the main goal while responding with the final answer
        `),
      ],
      response_format: zodResponseFormat(
        z.object({
          finalAnswer: z.string().describe('The final result of the task'),
        }),
        'task_result'
      ),
    })
    const message = res.choices[0].message.parsed
    if (!message) {
      throw new Error('No parsed response received')
    }
    return finish(state, response(message.finalAnswer))
  },
}

export const finalBoss = (options?: AgentOptions) =>
  agent({
    ...defaults,
    ...options,
  })
