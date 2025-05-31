export interface GetFunctionsOptions {
  maxDepth?: number
  excludedKeys?: string[]
  includePrivate?: boolean
  includeNonFunctions?: boolean
  includeClasses?: boolean
  followPrototypes?: boolean
  debug?: boolean
}
