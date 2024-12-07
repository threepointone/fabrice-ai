import { ChatCompletionMessageParam } from 'openai/resources/index.mjs'

/**
 * Utility type to get optional keys from T.
 */
export type OptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never
}[keyof T]

/**
 * Utility type to get optional properties from T.
 */
export type OptionalProperties<T> = Pick<T, OptionalKeys<T>>

/**
 * Utility type to make optional properties required (only includes optional props).
 */
export type RequiredOptionals<T> = Required<OptionalProperties<T>>

export type Message = ChatCompletionMessageParam