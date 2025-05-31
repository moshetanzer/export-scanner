function isBuiltinObject(obj: any): boolean {
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

function shouldExcludeKey(key: string, includePrivate: boolean, excludedKeys: string[]): boolean {
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

  // Enhanced RegExp method detection
  const regexpMethods = ['exec', 'test', 'compile', 'source', 'global', 'ignoreCase', 'multiline', 'sticky', 'unicode', 'flags', 'dotAll']
  if (regexpMethods.includes(key)) {
    return true
  }

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

  return false
}

// eslint-disable-next-line ts/no-unsafe-function-type
function isClass(fn: Function): boolean {
  if (typeof fn !== 'function')
    return false

  try {
    const fnStr = fn.toString()
    if (fnStr.startsWith('class ') || fnStr.includes('class ')) {
      return true
    }

    // Check if it has a prototype with constructor
    if (fn.prototype && fn.prototype.constructor === fn) {
      // Check if it has methods on prototype
      const protoProps = Object.getOwnPropertyNames(fn.prototype)
      return protoProps.length > 1 || (protoProps.length === 1 && protoProps[0] !== 'constructor')
    }

    return false
  }
  catch {
    return false
  }
}

export { isBuiltinObject, isClass, shouldExcludeKey }
