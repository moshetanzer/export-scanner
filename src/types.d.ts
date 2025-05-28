export interface GetFunctionsOptions {
  maxDepth?: number
  excludedKeys?: string[]
  includePrivate?: boolean
  includeNonFunctions?: boolean
  followPrototypes?: boolean
  debug?: boolean
}
