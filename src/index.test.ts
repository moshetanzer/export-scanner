/* eslint-disable style/max-statements-per-line */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import lodash from 'lodash'
import { describe, expect, it } from 'vitest'
import { analyzeExports, getExports, listExportNames } from './index'

describe('package Export Analyzer', () => {
  describe('listExportNames', () => {
    describe('basic function detection', () => {
      it('should find functions in flat objects', () => {
        const pkg = {
          foo() { return 'foo' },
          bar() { return 'bar' },
          notAFunction: 'string',
        }

        const exports = listExportNames(pkg)
        expect(exports).toContain('foo')
        expect(exports).toContain('bar')
        expect(exports).not.toContain('notAFunction')
      })

      it('should find nested functions', () => {
        const pkg = {
          utils: {
            string: {
              trim() { return 'trimmed' },
              pad() { return 'padded' },
            },
            number: {
              random() { return Math.random() },
            },
          },
          main() { return 'main' },
        }

        const exports = listExportNames(pkg)
        expect(exports).toContain('main')
        expect(exports).toContain('utils.string.trim')
        expect(exports).toContain('utils.string.pad')
        expect(exports).toContain('utils.number.random')
      })

      it('should detect main function when package is a function', () => {
        const pkg = function mainFunction() {
          return 'main'
        }
        pkg.helper = function () { return 'helper' }

        const exports = listExportNames(pkg)
        expect(exports).toContain('main')
        expect(exports).toContain('helper')
      })
    })

    describe('class and prototype handling', () => {
      it('should find class methods when followPrototypes is enabled', () => {
        class TestClass {
          constructor() {}
          instanceMethod() { return 'instance' }
          static staticMethod() { return 'static' }
        }

        const pkg = { TestClass }
        const exports = listExportNames(pkg, { followPrototypes: true })

        expect(exports).toContain('TestClass')
        expect(exports).toContain('TestClass.staticMethod')
        expect(exports).toContain('TestClass.instanceMethod')
      })

      it('should handle constructor functions', () => {
        function MyConstructor() {}
        MyConstructor.prototype.instanceMethod = function () { return 'instance' }
        MyConstructor.staticMethod = function () { return 'static' }

        const pkg = { MyConstructor }
        const exports = listExportNames(pkg, { followPrototypes: true })

        expect(exports).toContain('MyConstructor')
        expect(exports).toContain('MyConstructor.staticMethod')
        expect(exports).toContain('MyConstructor.instanceMethod')
      })

      it('should skip prototype methods when followPrototypes is false', () => {
        class TestClass {
          instanceMethod() { return 'instance' }
          static staticMethod() { return 'static' }
        }

        const pkg = { TestClass }
        const exports = listExportNames(pkg, { followPrototypes: false })

        expect(exports).toContain('TestClass')
        expect(exports).toContain('TestClass.staticMethod')
        expect(exports).not.toContain('TestClass.instanceMethod')
      })
    })

    describe('eS module patterns', () => {
      it('should handle default-only export pattern', () => {
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

        const exports = listExportNames(pkg)
        expect(exports).toContain('method1')
        expect(exports).toContain('method2')
        expect(exports).toContain('nested.deepMethod')
      })

      it('should handle mixed default and named exports', () => {
        const pkg = {
          default() { return 'default' },
          namedFunction() { return 'named' },
          __esModule: true,
        }

        const exports = listExportNames(pkg)
        expect(exports).toContain('default')
        expect(exports).toContain('namedFunction')
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

        const exports = listExportNames(pkg)
        expect(exports).toContain('function1')
        expect(exports).toContain('function2')
        expect(exports).toContain('submodule.subfunc')
      })
    })

    describe('options testing', () => {
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

        const shallow = listExportNames(pkg, { maxDepth: 1 })
        const deep = listExportNames(pkg, { maxDepth: 4 })

        expect(shallow).not.toContain('level1.level2.level3.level4.deepFunction')
        expect(deep).toContain('level1.level2.level3.level4.deepFunction')
      })

      it('should include non-functions when includeNonFunctions is true', () => {
        const pkg = {
          func() { return 'func' },
          string: 'hello',
          number: 42,
          array: [1, 2, 3],
          object: { nested: 'value' },
        }

        const functionsOnly = listExportNames(pkg, { includeNonFunctions: false })
        const allExports = listExportNames(pkg, { includeNonFunctions: true })

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

        const publicOnly = listExportNames(pkg, { includePrivate: false })
        const withPrivate = listExportNames(pkg, { includePrivate: true })

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

        const exports = listExportNames(pkg, {
          excludedKeys: ['forbiddenMethod', 'anotherForbidden'],
        })

        expect(exports).toContain('allowedMethod')
        expect(exports).not.toContain('forbiddenMethod')
        expect(exports).not.toContain('anotherForbidden')
      })
    })

    describe('edge cases', () => {
      it('should handle null and undefined', () => {
        expect(listExportNames(null)).toEqual([])
        expect(listExportNames(undefined)).toEqual([])
      })

      it('should handle empty objects', () => {
        expect(listExportNames({})).toEqual([])
      })

      it('should handle circular references', () => {
        const pkg: any = {
          method() { return 'method' },
        }
        pkg.self = pkg

        const exports = listExportNames(pkg)
        expect(exports).toContain('method')
        expect(exports.length).toBeGreaterThan(0)
      })

      it('should handle getters and setters', () => {
        const pkg = {}
        Object.defineProperty(pkg, 'getter', {
          get() { return 'getter value' },
          enumerable: true,
        })
        // eslint-disable-next-line accessor-pairs
        Object.defineProperty(pkg, 'setter', {
          set(_value) { /* setter */ },
          enumerable: true,
        })
        Object.defineProperty(pkg, 'both', {
          get() { return 'both value' },
          set(_value) { /* setter */ },
          enumerable: true,
        })

        const exports = listExportNames(pkg)
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

        const exports = listExportNames(pkg)
        expect(exports).toContain('enumerable')
        expect(exports).toContain('nonEnumerable')
      })

      it('should handle inaccessible properties gracefully', () => {
        const pkg: any = {}
        Object.defineProperty(pkg, 'thrower', {
          get() { throw new Error('Access denied') },
          enumerable: true,
        })
        pkg.normal = function () { return 'normal' }

        const exports = listExportNames(pkg)
        expect(exports).toContain('normal')
        expect(exports).toContain('thrower')
      })
    })

    describe('real-world packages', () => {
      it('should analyze Node.js fs module', () => {
        const exports = listExportNames(fs)

        expect(exports).toContain('readFile')
        expect(exports).toContain('writeFile')
        expect(exports).toContain('readdir')
        expect(exports).toContain('stat')
        expect(exports).toContain('createReadStream')
        expect(exports).toContain('createWriteStream')
      })

      it('should analyze Node.js path module', () => {
        const exports = listExportNames(path)

        expect(exports).toContain('join')
        expect(exports).toContain('resolve')
        expect(exports).toContain('dirname')
        expect(exports).toContain('basename')
        expect(exports).toContain('extname')
        expect(exports).toContain('normalize')
      })

      it('should analyze Node.js crypto module', () => {
        const exports = listExportNames(crypto)

        expect(exports).toContain('createHash')
        expect(exports).toContain('createHmac')
        expect(exports).toContain('randomBytes')
        expect(exports).toContain('pbkdf2')
      })

      it('should analyze lodash', () => {
        const exports = listExportNames(lodash).filter(name =>
          ['map', 'filter', 'reduce', 'forEach', 'pick', 'omit'].includes(name),
        )

        expect(exports).toContain('map')
        expect(exports).toContain('filter')
        expect(exports).toContain('reduce')
        expect(exports).toContain('forEach')
        expect(exports).toContain('pick')
        expect(exports).toContain('omit')
      })
    })
  })

  describe('analyzeExports', () => {
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

      const analysis = analyzeExports(pkg)

      expect(analysis.functions).toContain('func1')
      expect(analysis.functions).toContain('func2')
      expect(analysis.functions).toContain('nested.nestedFunc')
      expect(analysis.functions).not.toContain('string (string)')

      expect(analysis.allExports).toContain('func1')
      expect(analysis.allExports).toContain('string (string)')
      expect(analysis.allExports).toContain('number (number)')

      expect(analysis.summary.totalFunctions).toBe(3)
      expect(analysis.summary.totalExports).toBeGreaterThanOrEqual(5)
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

      const analysis = analyzeExports(pkg)

      expect(analysis.summary.isFunction).toBe(true)
      expect(analysis.summary.isObject).toBe(false)
      expect(analysis.functions).toContain('main')
      expect(analysis.functions).toContain('helper')
    })

    it('should detect default exports', () => {
      const pkg = {
        default() { return 'default' },
        other() { return 'other' },
        __esModule: true,
      }

      const analysis = analyzeExports(pkg)

      expect(analysis.summary.hasDefault).toBe(true)
      expect(analysis.functions).toContain('default')
      expect(analysis.functions).toContain('other')
    })

    it('should handle real lodash analysis', () => {
      const analysis = analyzeExports(lodash)
      expect(analysis.summary.totalFunctions).toBeGreaterThan(100)
      expect(analysis.functions).toContain('map')
      expect(analysis.functions).toContain('filter')
      expect(analysis.functions).toContain('reduce')
    })
  })

  describe('getExports', () => {
    it('should return function and class objects', () => {
      class TestClass {
        method() { return 'method' }
        static staticMethod() { return 'static' }
      }

      function testFunction() { return 'function' }

      const pkg = { TestClass, testFunction }
      const exports = getExports(pkg, { followPrototypes: true })

      expect(exports.TestClass).toBe(TestClass)
      expect(exports.testFunction).toBe(testFunction)
      expect(typeof exports['TestClass.staticMethod']).toBe('function')
      expect(typeof exports['TestClass.prototype.method']).toBe('function')
    })

    it('should handle main function detection', () => {
      const mainFunc = function () { return 'main' }
      mainFunc.helper = function () { return 'helper' }

      const exports = getExports(mainFunc)

      expect(exports.main).toBe(mainFunc)
      expect(exports.helper).toBe(mainFunc.helper)
    })

    it('should return empty object for null/undefined', () => {
      const nullResult = getExports(null)
      const undefinedResult = getExports(undefined)

      expect(Object.keys(nullResult)).toEqual([])
      expect(Object.keys(undefinedResult)).toEqual([])
    })

    it('should handle nested functions', () => {
      const pkg = {
        utils: {
          string: {
            trim() { return 'trimmed' },
          },
        },
      }

      const exports = getExports(pkg)
      expect(typeof exports['utils.string.trim']).toBe('function')
    })

    it('should handle circular references', () => {
      const pkg: any = {
        method() { return 'method' },
      }
      pkg.self = pkg

      const exports = getExports(pkg)
      expect(typeof exports.method).toBe('function')
      expect(Object.keys(exports).length).toBeGreaterThan(0)
    })

    it('should handle default export patterns', () => {
      const pkg = {
        default: {
          method1() { return 'method1' },
          method2() { return 'method2' },
        },
        __esModule: true,
      }

      const exports = getExports(pkg)
      expect(typeof exports.method1).toBe('function')
      expect(typeof exports.method2).toBe('function')
    })

    it('should respect includeClasses option', () => {
      class TestClass {
        method() { return 'method' }
      }

      const pkg = { TestClass }

      const withClasses = getExports(pkg, { includeClasses: true })
      const withoutClasses = getExports(pkg, { includeClasses: false })

      expect(withClasses.TestClass).toBe(TestClass)
      expect(withoutClasses.TestClass).toBeUndefined()
    })

    it('should handle excludedKeys option', () => {
      const pkg = {
        allowed() { return 'allowed' },
        forbidden() { return 'forbidden' },
      }

      const exports = getExports(pkg, { excludedKeys: ['forbidden'] })

      expect(typeof exports.allowed).toBe('function')
      expect(exports.forbidden).toBeUndefined()
    })
  })

  describe('performance tests', () => {
    it('should handle large packages efficiently', () => {
      const largePkg: any = {}

      for (let i = 0; i < 1000; i++) {
        largePkg[`func${i}`] = function () { return `func${i}` }
      }

      const start = Date.now()
      const exports = listExportNames(largePkg)
      const duration = Date.now() - start

      expect(exports.length).toBe(1000)
      expect(duration).toBeLessThan(1000)
    })

    it('should handle deep nesting efficiently', () => {
      const deepPkg: any = {}
      let current = deepPkg

      for (let i = 0; i < 20; i++) {
        current.level = {}
        current.func = function () { return `level${i}` }
        current = current.level
      }

      const exports = listExportNames(deepPkg, { maxDepth: 25 })
      expect(exports.length).toBeGreaterThan(10)
    })
  })

  describe('uniqueness and deduplication', () => {
    it('should maintain export uniqueness', () => {
      const sharedFunc = function () { return 'shared' }
      const pkg: any = {
        duplicate: sharedFunc,
        nested: {
          duplicate: sharedFunc,
        },
      }

      const exports = listExportNames(pkg)
      const duplicates = exports.filter(exp => exp.includes('duplicate'))

      expect(duplicates.length).toBe(2)
      expect(duplicates).toContain('duplicate')
      expect(duplicates).toContain('nested.duplicate')
      expect(new Set(exports).size).toBe(exports.length)
    })
  })
})
