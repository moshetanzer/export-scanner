import type { GetFunctionsOptions } from './types'
import { isBuiltinObject, isClass, shouldExcludeKey } from './utils'
/**
 * Recursively analyzes a package/module object and returns a list of export names (functions and optionally non-functions).
 *
 * This utility is designed to robustly enumerate all exported functions (and optionally other values) from a JavaScript/TypeScript
 * package, handling both CommonJS and ES Module patterns, including default exports, prototype methods, and lazy-loaded getters.
 *
 * @param pkg - The package or module object to analyze. Can be a CommonJS module, ES module, or any object.
 * @param options - Optional configuration for export discovery.
 * @param options.maxDepth - Maximum recursion depth for nested objects (default: 3).
 * @param options.excludedKeys - List of property names to always exclude from exports (default: common JS/TS internals).
 * @param options.includePrivate - Whether to include properties starting with `_` or `__` (default: false).
 * @param options.includeNonFunctions - Whether to include non-function exports (default: false).
 * @param options.followPrototypes - Whether to include prototype methods in the export list (default: true).
 * @param options.debug - Enable verbose debug logging to the console (default: false).
 * @returns An array of export names (as strings), including nested paths (e.g., "foo.bar.baz").
 *
 * @example
 * ```typescript
 * import * as myLib from 'my-lib';
 * const exports = getExports(myLib, { includeNonFunctions: true });
 * // exports might be: ['foo', 'bar.baz', 'qux (number)']
 * ```
 */
function listExportNames(pkg: any, options: GetFunctionsOptions = {}): string[] {
  const {
    maxDepth = 3,
    excludedKeys = ['constructor', 'prototype', 'caller', 'arguments', 'name', 'length'],
    includePrivate = false,
    includeNonFunctions = false,
    followPrototypes = true,
    debug = false,
  } = options

  const exports: string[] = []
  const visited = new WeakSet()

  const log = (message: string, data?: any) => {
    if (debug) {
      console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '')
    }
  }

  const explore = (obj: any, path = '', depth = 0) => {
    log(`Exploring: ${path || 'root'}, depth: ${depth}, type: ${typeof obj}`)

    if (depth > maxDepth || obj === null || isBuiltinObject(obj)) {
      log(`Stopping exploration: depth=${depth}, maxDepth=${maxDepth}, isNull=${obj === null}, isBuiltin=${isBuiltinObject(obj)}`)
      return
    }

    if (typeof obj === 'object' || typeof obj === 'function') {
      if (visited.has(obj)) {
        log(`Already visited: ${path}`)
        return
      }
      visited.add(obj)
    }

    if (typeof obj === 'function') {
      const exportName = path || 'main'
      log(`Found function: ${exportName}`)
      exports.push(exportName)
    }

    if (includeNonFunctions && path && typeof obj !== 'function') {
      const type = Array.isArray(obj) ? 'array' : typeof obj
      const exportName = `${path} (${type})`
      log(`Found non-function: ${exportName}`)
      exports.push(exportName)
    }

    if (typeof obj === 'object' || typeof obj === 'function') {
      try {
        const allKeys = new Set([
          ...Object.keys(obj),
          ...Object.getOwnPropertyNames(obj),
        ])

        log(`Found keys for ${path || 'root'}:`, Array.from(allKeys))

        const filteredKeys = Array.from(allKeys).filter(key =>
          !shouldExcludeKey(key, includePrivate, excludedKeys),
        )

        log(`Filtered keys for ${path || 'root'}:`, filteredKeys)

        filteredKeys.sort()

        for (const key of filteredKeys) {
          try {
            // Handle getters/setters first
            const descriptor = Object.getOwnPropertyDescriptor(obj, key)
            if (descriptor && (descriptor.get || descriptor.set) && !descriptor.value) {
              const newPath = path ? `${path}.${key}` : key
              log(`Found getter/setter property: ${newPath}`)
              exports.push(newPath)
              continue
            }

            const value = obj[key]
            const newPath = path ? `${path}.${key}` : key

            if (typeof value === 'function') {
              log(`Found function property: ${newPath}`)
              exports.push(newPath)
            }

            if (includeNonFunctions && typeof value !== 'function' && value !== null && value !== undefined) {
              const type = Array.isArray(value) ? 'array' : typeof value
              const exportName = `${newPath} (${type})`
              log(`Found non-function property: ${exportName}`)
              exports.push(exportName)
            }

            if ((typeof value === 'object' || typeof value === 'function')
              && value !== null
              && depth < maxDepth
              && !isBuiltinObject(value)) {
              explore(value, newPath, depth + 1)
            }
          }
          catch (error) {
            log(`Error accessing property ${key}:`, error instanceof Error ? error.message : String(error))
            // Even if we can't access the property value, if it's likely a function export,
            // let's add it based on the property descriptor
            try {
              const descriptor = Object.getOwnPropertyDescriptor(obj, key)
              if (descriptor && descriptor.get) {
                const newPath = path ? `${path}.${key}` : key
                log(`Found getter property (assuming function): ${newPath}`)
                exports.push(newPath)
              }
            }
            catch {
              // Skip if we can't even get the descriptor
            }
          }
        }

        // Handle prototype exploration for classes and constructor functions
        if (followPrototypes && typeof obj === 'function' && obj.prototype && !isBuiltinObject(obj.prototype)) {
          try {
            const prototypeKeys = Object.getOwnPropertyNames(obj.prototype)
            const className = path || obj.name || 'UnknownClass'

            log(`Exploring prototype for ${className}:`, prototypeKeys)

            for (const key of prototypeKeys) {
              if (!shouldExcludeKey(key, includePrivate, excludedKeys)) {
                try {
                  const descriptor = Object.getOwnPropertyDescriptor(obj.prototype, key)
                  if (descriptor && typeof descriptor.value === 'function') {
                    const methodPath = `${className}.${key}`
                    log(`Found prototype method: ${methodPath}`)
                    exports.push(methodPath)
                  }
                }
                catch {
                  // Skip if we can't access the property
                }
              }
            }
          }
          catch {
            // Skip if prototype access fails
          }
        }
      }
      catch (error) {
        log(
          `Error enumerating properties for ${path}:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  log('=== PACKAGE ANALYSIS START ===')
  log('Package type:', typeof pkg)
  log('Package is null/undefined:', pkg === null || pkg === undefined)

  if (pkg) {
    log('Package keys:', Object.keys(pkg))
    log('Package has default:', 'default' in pkg)
    log('Package has __esModule:', '__esModule' in pkg)

    if (pkg.default) {
      log('Default export type:', typeof pkg.default)
      if (typeof pkg.default === 'object') {
        log('Default export keys:', Object.keys(pkg.default))
      }
    }
  }

  if (pkg === null || pkg === undefined) {
    log('Package is null/undefined, returning empty array')
    return []
  }

  if (typeof pkg === 'object' && pkg.default !== undefined) {
    const keys = Object.keys(pkg)
    log('Package has default export, keys:', keys)

    if ((keys.length === 1 && keys[0] === 'default')
      || (keys.length <= 3 && keys.includes('default') && keys.includes('__esModule'))) {
      log('Detected default-only export pattern')

      if (typeof pkg.default === 'object' && pkg.default !== null) {
        const defaultKeys = Object.keys(pkg.default)
        log('Default export object keys:', defaultKeys)
        if (defaultKeys.length > 0) {
          explore(pkg.default)

          for (const key of keys.filter(k => k !== 'default' && k !== '__esModule')) {
            try {
              if (typeof pkg[key] === 'function') {
                exports.push(key)
              }
              else if (includeNonFunctions) {
                const type = Array.isArray(pkg[key]) ? 'array' : typeof pkg[key]
                exports.push(`${key} (${type})`)
              }
              explore(pkg[key], key, 1)
            }
            catch {
              // Skip inaccessible
            }
          }

          log('Final exports after default exploration:', exports)
          return [...new Set(exports)]
        }
      }

      if (typeof pkg.default === 'function') {
        log('Default export is a function')
        exports.push('default')
      }
    }
  }

  log('Exploring regular package structure')
  explore(pkg)

  log('=== FINAL EXPORTS ===', exports)
  return [...new Set(exports)]
}
/**
 * Analyzes the exports of a given package object, returning its functions, all exports,
 * and a summary of key characteristics.
 *
 * @param pkg - The package object to analyze.
 * @param options - Optional configuration for export retrieval.
 * @returns An object containing:
 *   - `functions`: An array of function exports from the package.
 *   - `allExports`: An array of all exports (functions and non-functions) from the package.
 *   - `summary`: An object summarizing:
 *       - `totalFunctions`: The number of function exports.
 *       - `totalExports`: The total number of exports.
 *       - `hasDefault`: Whether the package has a default export.
 *       - `isFunction`: Whether the package itself is a function.
 *       - `isObject`: Whether the package is a non-null object.
 */
function analyzeExports(pkg: any, options: GetFunctionsOptions = {}) {
  const functions = listExportNames(pkg, { ...options, includeNonFunctions: false })
  const allExports = listExportNames(pkg, { ...options, includeNonFunctions: true })

  return {
    functions,
    allExports,
    summary: {
      totalFunctions: functions.length,
      totalExports: allExports.length,
      hasDefault: pkg?.default !== undefined,
      isFunction: typeof pkg === 'function',
      isObject: typeof pkg === 'object' && pkg !== null,
    },
  }
}

/**
 * Extracts all callable exports (functions and classes) from a given package/module object.
 *
 * Traverses the provided object up to a configurable depth, collecting all functions and classes,
 * including those nested within properties or prototype chains. Handles both CommonJS and ES module
 * default export patterns. Allows customization of which keys to exclude, whether to include private
 * members, and whether to follow prototype chains for class methods.
 *
 * @param pkg - The package or module object to extract callables from.
 * @param options - Optional configuration for extraction.
 * @param options.maxDepth - Maximum depth to traverse nested objects (default: 3).
 * @param options.excludedKeys - List of property keys to exclude from extraction (default: ['constructor', 'prototype', 'caller', 'arguments', 'name', 'length']).
 * @param options.includePrivate - Whether to include properties starting with an underscore (default: false).
 * @param options.followPrototypes - Whether to extract methods from class prototypes (default: true).
 * @param options.includeClasses - Whether to include classes in the result (default: true).
 * @param options.debug - Enable debug logging to the console (default: false).
 * @returns An object containing all extracted functions and, if enabled, classes, keyed by their property paths.
 */
function getExports(pkg: any, options: GetFunctionsOptions = {}) {
  const {
    maxDepth = 3,
    excludedKeys = ['constructor', 'prototype', 'caller', 'arguments', 'name', 'length'],
    includePrivate = false,
    followPrototypes = true,
    includeClasses = true,
    debug = false,
  } = options

  // eslint-disable-next-line ts/no-unsafe-function-type
  const functions: Record<string, Function> = {}
  const classes: Record<string, new (...args: any[]) => any> = {}
  const visited = new WeakSet()

  const log = (message: string, data?: any) => {
    if (debug) {
      console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '')
    }
  }
  if (pkg === null || pkg === undefined) {
    return {}
  }
  const extractCallables = (obj: any, path = '', depth = 0) => {
    if (depth > maxDepth || obj === null || isBuiltinObject(obj)) {
      return
    }

    if (typeof obj === 'object' || typeof obj === 'function') {
      if (visited.has(obj))
        return
      visited.add(obj)
    }

    if (typeof obj === 'function') {
      const exportPath = path || 'main'
      if (isClass(obj)) {
        log(`Found class: ${exportPath}`)
        classes[exportPath] = obj as new (...args: any[]) => any
      }
      else {
        log(`Found function: ${exportPath}`)
        functions[exportPath] = obj
      }
    }

    if (typeof obj === 'object' || typeof obj === 'function') {
      try {
        const allKeys = new Set([
          ...Object.keys(obj),
          ...Object.getOwnPropertyNames(obj),
        ])

        const filteredKeys = Array.from(allKeys).filter(key => !shouldExcludeKey(key, includePrivate, excludedKeys))

        for (const key of filteredKeys) {
          try {
            const value = obj[key]
            const newPath = path ? `${path}.${key}` : key

            if (typeof value === 'function') {
              if (isClass(value)) {
                log(`Found class property: ${newPath}`)
                classes[newPath] = value as new (...args: any[]) => any
              }
              else {
                log(`Found function property: ${newPath}`)
                functions[newPath] = value
              }
            }

            if ((typeof value === 'object' || typeof value === 'function')
              && value !== null
              && depth < maxDepth
              && !isBuiltinObject(value)) {
              extractCallables(value, newPath, depth + 1)
            }
          }
          catch (error) {
            log(`Error accessing property ${key}:`, error instanceof Error ? error.message : String(error))
          }
        }

        // Handle prototype methods for classes
        if (followPrototypes && typeof obj === 'function' && obj.prototype && !isBuiltinObject(obj.prototype)) {
          try {
            const prototypeKeys = Object.getOwnPropertyNames(obj.prototype)
            const className = path || obj.name || 'UnknownClass'

            for (const key of prototypeKeys) {
              if (!shouldExcludeKey(key, includePrivate, excludedKeys)) {
                try {
                  const descriptor = Object.getOwnPropertyDescriptor(obj.prototype, key)
                  if (descriptor && typeof descriptor.value === 'function') {
                    const methodPath = `${className}.prototype.${key}`
                    log(`Found prototype method: ${methodPath}`)
                    functions[methodPath] = descriptor.value
                  }
                }
                catch {
                  // Skip if we can't access the property
                }
              }
            }
          }
          catch {
            // Skip if prototype access fails
          }
        }
      }
      catch (error) {
        log(`Error enumerating properties for ${path}:`, error instanceof Error ? error.message : String(error))
      }
    }
  }

  log('=== CALLABLE EXPORTS EXTRACTION START ===')

  if (pkg === null || pkg === undefined) {
    return { functions: {}, classes: {}, summary: { totalFunctions: 0, totalClasses: 0 } }
  }

  // Handle default export pattern
  if (typeof pkg === 'object' && pkg.default !== undefined) {
    const keys = Object.keys(pkg)

    if ((keys.length === 1 && keys[0] === 'default')
      || (keys.length <= 3 && keys.includes('default') && keys.includes('__esModule'))) {
      if (typeof pkg.default === 'function') {
        if (isClass(pkg.default)) {
          classes.default = pkg.default as new (...args: any[]) => any
        }
        else {
          functions.default = pkg.default
        }
      }
      else if (typeof pkg.default === 'object' && pkg.default !== null) {
        extractCallables(pkg.default)
      }

      // Also check other named exports
      for (const key of keys.filter(k => k !== 'default' && k !== '__esModule')) {
        try {
          extractCallables(pkg[key], key, 1)
        }
        catch {
          // Skip inaccessible
        }
      }
    }
    else {
      extractCallables(pkg)
    }
  }
  else {
    extractCallables(pkg)
  }
  // eslint-disable-next-line ts/no-unsafe-function-type
  const allFinalExports: Record<string, Function | (new (...args: any[]) => any)> = {}

  // Add functions to combined object
  for (const [key, func] of Object.entries(functions)) {
    allFinalExports[key] = func
  }

  if (includeClasses) {
    for (const [key, cls] of Object.entries(classes)) {
      allFinalExports[key] = cls
    }
  }

  return {
    ...allFinalExports,
  }
}
export { analyzeExports, getExports, listExportNames }
