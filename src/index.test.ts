import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as lodash from 'lodash'
import { describe, expect, it } from 'vitest'
import { analyzePackage, getExports } from './index'

interface TestPackage {
  [key: string]: any
}

describe('package Export Analyzer', () => {
  describe('getExports', () => {
    describe('commonJS Patterns', () => {
      it('should handle module.exports = function', () => {
        const pkg = function mainFunction() {
          return 'test'
        }
        pkg.helper = function () {
          return 'helper'
        }

        const exports = getExports(pkg)
        expect(exports).toContain('main')
        expect(exports).toContain('helper')
      })

      it('should handle module.exports = {}', () => {
        const pkg = {
          method1() { return 'method1' },
          method2() { return 'method2' },
          constant: 'value',
        }

        const exports = getExports(pkg)
        expect(exports).toContain('method1')
        expect(exports).toContain('method2')
        expect(exports).not.toContain('constant')
      })

      it('should handle module.exports with nested objects', () => {
        const pkg = {
          utils: {
            string: {
              trim(str: string) { return str.trim() },
              pad(str: string) { return str },
            },
            number: {
              random() { return Math.random() },
            },
          },
          main() { return 'main' },
        }

        const exports = getExports(pkg)
        expect(exports).toContain('main')
        expect(exports).toContain('utils.string.trim')
        expect(exports).toContain('utils.string.pad')
        expect(exports).toContain('utils.number.random')
      })

      it('should handle exports.* pattern', () => {
        const pkg = {}
        Object.assign(pkg, {
          create() { return {} },
          destroy() { return true },
          update() { return 'updated' },
        })

        const exports = getExports(pkg)
        expect(exports).toContain('create')
        expect(exports).toContain('destroy')
        expect(exports).toContain('update')
      })
    })

    describe('eS Module Patterns', () => {
      // it('should handle default export with named exports', () => {
      //   const pkg = {
      //     default: function defaultFunc() { return 'default' },
      //     namedExport1() { return 'named1' },
      //     namedExport2() { return 'named2' },
      //     __esModule: true,
      //   }

      //   const exports = getExports(pkg)
      //   expect(exports).toContain('default')
      //   expect(exports).toContain('namedExport1')
      //   expect(exports).toContain('namedExport2')
      // })

      it('should handle default-only export', () => {
        const pkg = {
          default: {
            method1() { return 'method1' },
            method2() { return 'method2' },
            nested: {
              deepMethod() { return 'deep' },
            },
          },
          __esModule: true,
        }

        const exports = getExports(pkg)
        expect(exports).toContain('method1')
        expect(exports).toContain('method2')
        expect(exports).toContain('nested.deepMethod')
      })

      it('should handle namespace import pattern', () => {
        const pkg = {
          function1() { return 'func1' },
          function2() { return 'func2' },
          submodule: {
            subfunc() { return 'subfunc' },
          },
          __esModule: true,
        }

        const exports = getExports(pkg)
        expect(exports).toContain('function1')
        expect(exports).toContain('function2')
        expect(exports).toContain('submodule.subfunc')
      })
    })

    describe('class and Constructor Patterns', () => {
      it('should handle ES6 classes', () => {
        class TestClass {
          constructor() {}
          method1() { return 'method1' }
          method2() { return 'method2' }
          static staticMethod() { return 'static' }
        }

        const pkg = { TestClass }
        const exports = getExports(pkg, { followPrototypes: true })

        expect(exports).toContain('TestClass')
        expect(exports).toContain('TestClass.staticMethod')
        expect(exports).toContain('TestClass.method1')
        expect(exports).toContain('TestClass.method2')
      })

      it('should handle constructor functions', () => {
        function MyConstructor() {}
        MyConstructor.prototype.instanceMethod = function () {
          return 'instance'
        }
        MyConstructor.staticMethod = function () {
          return 'static'
        }

        const pkg = { MyConstructor }
        const exports = getExports(pkg, { followPrototypes: true })

        expect(exports).toContain('MyConstructor')
        expect(exports).toContain('MyConstructor.staticMethod')
        expect(exports).toContain('MyConstructor.instanceMethod')
      })

      it('should handle factory patterns', () => {
        const createFactory = function () {
          return {
            create() { return {} },
            build() { return 'built' },
          }
        }
        createFactory.utils = {
          helper() { return 'help' },
        }

        const pkg = { factory: createFactory }
        const exports = getExports(pkg)

        expect(exports).toContain('factory')
        expect(exports).toContain('factory.utils.helper')
      })
    })

    describe('real Package Testing', () => {
      it('should analyze Node.js fs module', () => {
        const exports = getExports(fs)

        // Should find common fs functions
        expect(exports).toContain('readFile')
        expect(exports).toContain('writeFile')
        expect(exports).toContain('readdir')
        expect(exports).toContain('stat')
        expect(exports).toContain('createReadStream')
        expect(exports).toContain('createWriteStream')
      })

      it('should analyze Node.js path module', () => {
        const exports = getExports(path)

        expect(exports).toContain('join')
        expect(exports).toContain('resolve')
        expect(exports).toContain('dirname')
        expect(exports).toContain('basename')
        expect(exports).toContain('extname')
        expect(exports).toContain('normalize')
      })

      it('should analyze Node.js crypto module', () => {
        const exports = getExports(crypto)

        expect(exports).toContain('createHash')
        expect(exports).toContain('createHmac')
        expect(exports).toContain('randomBytes')
        expect(exports).toContain('pbkdf2')
      })

      it('should analyze lodash (if available)', () => {
        const exports = getExports(lodash)

        // Should find common lodash functions
        expect(exports.length).toBeGreaterThan(50)
        expect(exports).toContain('map')
        expect(exports).toContain('filter')
        expect(exports).toContain('reduce')
        expect(exports).toContain('forEach')
        expect(exports).toContain('pick')
        expect(exports).toContain('omit')
      })
    })

    describe('options Testing', () => {
      it('should respect maxDepth option', () => {
        const pkg = {
          level1: {
            level2: {
              level3: {
                level4: {
                  deepFunction() { return 'deep' },
                },
              },
            },
          },
        }

        const shallowExports = getExports(pkg, { maxDepth: 1 })
        const deepExports = getExports(pkg, { maxDepth: 4 })

        expect(shallowExports).not.toContain('level1.level2.level3.level4.deepFunction')
        expect(deepExports).toContain('level1.level2.level3.level4.deepFunction')
      })

      it('should respect includeNonFunctions option', () => {
        const pkg = {
          func() { return 'func' },
          string: 'hello',
          number: 42,
          array: [1, 2, 3],
          object: { nested: 'value' },
        }

        const functionsOnly = getExports(pkg, { includeNonFunctions: false })
        const allExports = getExports(pkg, { includeNonFunctions: true })

        expect(functionsOnly).toContain('func')
        expect(functionsOnly).not.toContain('string (string)')

        expect(allExports).toContain('func')
        expect(allExports).toContain('string (string)')
        expect(allExports).toContain('number (number)')
        expect(allExports).toContain('array (array)')
        expect(allExports).toContain('object (object)')
      })

      it('should respect includePrivate option', () => {
        const pkg = {
          publicMethod() { return 'public' },
          _privateMethod() { return 'private' },
          __internalMethod() { return 'internal' },
        }

        const publicOnly = getExports(pkg, { includePrivate: false })
        const withPrivate = getExports(pkg, { includePrivate: true })

        expect(publicOnly).toContain('publicMethod')
        expect(publicOnly).not.toContain('_privateMethod')
        expect(publicOnly).not.toContain('__internalMethod')

        expect(withPrivate).toContain('publicMethod')
        expect(withPrivate).toContain('_privateMethod')
        expect(withPrivate).toContain('__internalMethod')
      })

      it('should respect excludedKeys option', () => {
        const pkg = {
          allowedMethod() { return 'allowed' },
          forbiddenMethod() { return 'forbidden' },
          anotherForbidden() { return 'also forbidden' },
        }

        const exports = getExports(pkg, {
          excludedKeys: ['forbiddenMethod', 'anotherForbidden'],
        })

        expect(exports).toContain('allowedMethod')
        expect(exports).not.toContain('forbiddenMethod')
        expect(exports).not.toContain('anotherForbidden')
      })

      it('should respect followPrototypes option', () => {
        class TestClass {
          instanceMethod() { return 'instance' }
        }

        const pkg = { TestClass }

        const withPrototypes = getExports(pkg, { followPrototypes: true })
        const withoutPrototypes = getExports(pkg, { followPrototypes: false })

        expect(withPrototypes).toContain('TestClass.instanceMethod')
        expect(withoutPrototypes).not.toContain('TestClass.instanceMethod')
      })
    })

    describe('edge Cases', () => {
      it('should handle null and undefined', () => {
        expect(getExports(null)).toEqual([])
        expect(getExports(undefined)).toEqual([])
      })

      it('should handle empty objects', () => {
        expect(getExports({})).toEqual([])
      })

      it('should handle circular references', () => {
        const pkg: any = {
          method() { return 'method' },
        }
        pkg.self = pkg

        const exports = getExports(pkg)
        expect(exports).toContain('method')
        // Should not hang or crash due to circular reference
        expect(exports.length).toBeGreaterThan(0)
      })

      it('should handle getters and setters', () => {
        const pkg = {}
        Object.defineProperty(pkg, 'getter', {
          get() { return 'getter value' },
          enumerable: true,
        })
        Object.defineProperty(pkg, 'setter', {
          set(value) { /* setter */ },
          enumerable: true,
        })
        Object.defineProperty(pkg, 'both', {
          get() { return 'both value' },
          set(value) { /* setter */ },
          enumerable: true,
        })

        const exports = getExports(pkg)
        expect(exports).toContain('getter')
        expect(exports).toContain('setter')
        expect(exports).toContain('both')
      })

      it('should handle non-enumerable properties', () => {
        const pkg = {
          enumerable() { return 'enum' },
        }
        Object.defineProperty(pkg, 'nonEnumerable', {
          value() { return 'non-enum' },
          enumerable: false,
        })

        const exports = getExports(pkg)
        expect(exports).toContain('enumerable')
        expect(exports).toContain('nonEnumerable')
      })

      it('should handle inaccessible properties gracefully', () => {
        const pkg = {}
        Object.defineProperty(pkg, 'thrower', {
          get() { throw new Error('Access denied') },
          enumerable: true,
        })
        pkg.normal = function () {
          return 'normal'
        }

        const exports = getExports(pkg)
        expect(exports).toContain('normal')
        expect(exports).toContain('thrower') // Should still detect it as getter
      })
    })

    describe('complex Real-World Patterns', () => {
      it('should handle mixed export patterns', () => {
        const pkg = {
          // Default export pattern
          default() { return 'default' },

          // Named exports
          namedFunction() { return 'named' },

          // Namespace pattern
          utils: {
            string() { return 'string util' },
            array() { return 'array util' },
          },

          // Class export
          MyClass: class {
            method() { return 'class method' }
          },

          // Constants
          VERSION: '1.0.0',

          // Factory
          createSomething() {
            return {
              use() { return 'use' },
            }
          },

          __esModule: true,
        }

        const functionsOnly = getExports(pkg, { includeNonFunctions: false })
        const allExports = getExports(pkg, { includeNonFunctions: true })

        expect(functionsOnly).toContain('default')
        expect(functionsOnly).toContain('namedFunction')
        expect(functionsOnly).toContain('utils.string')
        expect(functionsOnly).toContain('utils.array')
        expect(functionsOnly).toContain('MyClass')
        expect(functionsOnly).toContain('createSomething')

        expect(allExports).toContain('VERSION (string)')
      })

      it('should handle lazy-loaded modules', () => {
        const pkg = {}
        let lazyLoaded = false

        Object.defineProperty(pkg, 'lazyModule', {
          get() {
            if (!lazyLoaded) {
              lazyLoaded = true
              return {
                init() { return 'initialized' },
                process() { return 'processed' },
              }
            }
            return this._cached
          },
          enumerable: true,
        })

        const exports = getExports(pkg)
        expect(exports).toContain('lazyModule')
      })
    })
  })

  describe('analyzePackage', () => {
    it('should provide comprehensive analysis', () => {
      const pkg = {
        func1() { return 'func1' },
        func2() { return 'func2' },
        string: 'hello',
        number: 42,
        nested: {
          nestedFunc() { return 'nested' },
        },
      }

      const analysis = analyzePackage(pkg)

      expect(analysis.functions).toContain('func1')
      expect(analysis.functions).toContain('func2')
      expect(analysis.functions).toContain('nested.nestedFunc')
      expect(analysis.functions).not.toContain('string (string)')

      expect(analysis.allExports).toContain('func1')
      expect(analysis.allExports).toContain('string (string)')
      expect(analysis.allExports).toContain('number (number)')

      expect(analysis.summary.totalFunctions).toBe(3)
      expect(analysis.summary.totalExports).toBe(5)
      expect(analysis.summary.hasDefault).toBe(false)
      expect(analysis.summary.isFunction).toBe(false)
      expect(analysis.summary.isObject).toBe(true)
    })

    it('should analyze function packages', () => {
      const pkg = function mainFunc() {
        return 'main'
      }
      pkg.helper = function () {
        return 'helper'
      }

      const analysis = analyzePackage(pkg)

      expect(analysis.summary.isFunction).toBe(true)
      expect(analysis.summary.isObject).toBe(false)
      expect(analysis.functions).toContain('main')
      expect(analysis.functions).toContain('helper')
    })

    // it('should analyze packages with default exports', () => {
    //   const pkg = {
    //     default() { return 'default' },
    //     other() { return 'other' },
    //   }

    //   const analysis = analyzePackage(pkg)

    //   expect(analysis.summary.hasDefault).toBe(true)
    //   expect(analysis.functions).toContain('default')
    //   expect(analysis.functions).toContain('other')
    // })

    it('should handle real lodash analysis', () => {
      const analysis = analyzePackage(lodash)

      expect(analysis.summary.totalFunctions).toBeGreaterThan(100)
      expect(analysis.summary.isObject).toBe(true)
      expect(analysis.functions).toContain('map')
      expect(analysis.functions).toContain('filter')
      expect(analysis.functions).toContain('reduce')
    })
  })

  describe('performance and Stress Tests', () => {
    it('should handle large packages efficiently', () => {
      const largePkg: TestPackage = {}

      // Create a large package with many exports
      for (let i = 0; i < 1000; i++) {
        largePkg[`func${i}`] = function () {
          return `func${i}`
        }
      }

      const start = Date.now()
      const exports = getExports(largePkg)
      const duration = Date.now() - start

      expect(exports.length).toBe(1000)
      expect(duration).toBeLessThan(1100) // Should complete within 1 second
    })

    it('should handle deep nesting efficiently', () => {
      const deepPkg: TestPackage = {}
      let current = deepPkg

      // Create deep nesting
      for (let i = 0; i < 20; i++) {
        current.level = {}
        current.func = function () {
          return `level${i}`
        }
        current = current.level
      }

      const exports = getExports(deepPkg, { maxDepth: 25 })
      expect(exports.length).toBeGreaterThan(10)
    })
  })
})

it('should maintain export uniqueness', () => {
  const pkg = {
    duplicate() { return 'duplicate' },
  }
  // Add the same function via different paths
  pkg.nested = { duplicate: pkg.duplicate }

  const exports = getExports(pkg)
  const duplicates = exports.filter(exp => exp.includes('duplicate'))

  // Should have both 'duplicate' and 'nested.duplicate'
  expect(duplicates.length).toBe(2)
  expect(new Set(exports).size).toBe(exports.length) // No duplicates
})
