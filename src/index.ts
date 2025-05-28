import type { GetFunctionsOptions } from './types'

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
export function getExports(pkg: any, options: GetFunctionsOptions = {}): string[] {
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

  const isBuiltinObject = (obj: any): boolean => {
    if (obj === null || obj === undefined) {
      return true
    }

    // Stop RegExp objects - this prevents .exec, .compile, .test explosion
    if (obj instanceof RegExp) {
      return true
    }

    const builtins = [
      Object.prototype,
      Array.prototype,
      Function.prototype,
      String.prototype,
      Number.prototype,
      Boolean.prototype,
      Date.prototype,
      RegExp.prototype,
      Error.prototype,
      Promise.prototype,
      Map.prototype,
      Set.prototype,
      WeakMap.prototype,
      WeakSet.prototype,
    ]

    if (builtins.includes(obj)) {
      return true
    }

    if (obj.constructor && builtins.some(builtin => obj.constructor === builtin.constructor)) {
      if (obj.constructor === String || obj.constructor === Number
        || obj.constructor === Boolean || obj.constructor === Date
        || obj.constructor === RegExp || obj.constructor === Error) {
        return obj.valueOf !== obj.constructor.prototype.valueOf
          || typeof obj.valueOf() !== 'object'
      }
    }

    // Check for native functions
    if (typeof obj === 'function') {
      try {
        const funcStr = obj.toString()
        if (funcStr.includes('[native code]')) {
          return true
        }
      }
      catch {
        return true
      }
    }

    return false
  }

  const shouldExcludeKey = (key: string, obj: any): boolean => {
    if (excludedKeys.includes(key)) {
      return true
    }
    if (!includePrivate && (key.startsWith('_') || key.startsWith('__'))) {
      return true
    }

    const commonSkips = [
      'valueOf',
      'toString',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
      'constructor',
    ]
    if (commonSkips.includes(key)) {
      return true
    }

    const functionMethods = ['apply', 'bind', 'call']
    if (functionMethods.includes(key)) {
      return true
    }

    // Enhanced RegExp method detection - not sure if this is needed but was giving issues
    const regexpMethods = ['exec', 'test', 'compile', 'source', 'global', 'ignoreCase', 'multiline', 'sticky', 'unicode', 'flags', 'dotAll']
    if (regexpMethods.includes(key)) {
      return true
    }

    // TODO: maybe default export should be handled differently abd should be included?
    const moduleMetadata = [
      'default',
      '__esModule',
      '__version',
      '__dirname',
      '__filename',
      '__webpack_require__',
      '__webpack_exports__',
      'module',
      'exports',
      'require',
      'global',
      'process',
      '__non_webpack_require__',
    ]
    if (moduleMetadata.includes(key)) {
      return true
    }

    const nodeSpecific = ['module', 'exports', 'require', 'global', 'process']
    if (nodeSpecific.includes(key)) {
      return true
    }

    const objectProps = ['length', 'size', 'version', 'VERSION']
    if (objectProps.includes(key)) {
      return true
    }

    if (key === 'placeholder') {
      return true
    }

    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, key)
      if (descriptor && (descriptor.get || descriptor.set) && !descriptor.value) {
        return false
      }
    }
    catch {
      // If we can't get descriptor, it might be inaccessible
    }

    return false
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

        if (followPrototypes && obj.constructor && obj.constructor.prototype && obj !== obj.constructor.prototype) {
          try {
            const protoKeys = Object.getOwnPropertyNames(obj.constructor.prototype)
            protoKeys.forEach(key => allKeys.add(key))
          }
          catch {
            // Skip if prototype access fails
          }
        }

        const filteredKeys = Array.from(allKeys).filter(key =>
          !shouldExcludeKey(key, obj),
        )

        log(`Filtered keys for ${path || 'root'}:`, filteredKeys)

        filteredKeys.sort()

        for (const key of filteredKeys) {
          try {
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

          keys.filter(k => k !== 'default' && k !== '__esModule').forEach((key) => {
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
          })

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
export function analyzePackage(pkg: any, options: GetFunctionsOptions = {}) {
  const functions = getExports(pkg, { ...options, includeNonFunctions: false })
  const allExports = getExports(pkg, { ...options, includeNonFunctions: true })

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
