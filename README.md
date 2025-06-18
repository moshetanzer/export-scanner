# 🔍 JS/TS Export Scanner

[![npm version](https://badge.fury.io/js/export-scanner.svg)](https://badge.fury.io/js/export-scanner)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/export-scanner)](https://bundlephobia.com/package/export-scanner)
[![license](https://img.shields.io/npm/l/export-scanner)](https://github.com/moshetanzer/export-scanner/blob/main/LICENSE)

A powerful TypeScript utility for recursively analyzing and extracting exports from JavaScript/TypeScript packages and modules. Handles both CommonJS and ES Module patterns with robust support for default exports, prototype methods, and lazy-loaded getters.

## ✨ Features

- 🔍 **Deep Analysis**: Recursively traverse package objects to find all exports
- 🎯 **Smart Detection**: Automatically handles CommonJS and ES Module patterns
- 🛡️ **Type Safe**: Full TypeScript support with comprehensive type definitions
- ⚡ **Flexible**: Configurable depth, exclusions, and analysis options
- 🔧 **Robust**: Handles edge cases like getters, setters, and prototype methods
- 📊 **Detailed**: Provides both export lists and callable function objects

## 📦 Installation

```bash
npm install export-scanner
```

```bash
yarn add export-scanner
```

```bash
pnpm add export-scanner
```

## 🚀 Quick Start

```typescript
import { analyzeExports, getExports, listExportNames } from 'export-scanner'
import * as myLib from 'some-library'

// Get a list of all export names
const exportNames = listExportNames(myLib)
console.log(exportNames)
// ['foo', 'bar.baz', 'MyClass.prototype.method']

// Get callable functions and classes
const callables = getExports(myLib)
console.log(Object.keys(callables))
// Access functions: callables.foo(), callables['bar.baz']()

// Get comprehensive analysis
const analysis = analyzeExports(myLib)
console.log(analysis.summary)
// { totalFunctions: 5, totalExports: 8, hasDefault: true, ... }
```

## 📖 API Reference

### `listExportNames(pkg, options?): string[]`

Recursively analyzes a package object and returns a list of export names.

#### Parameters

- `pkg` - The package or module object to analyze
- `options` - Optional configuration object

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxDepth` | `number` | `3` | Maximum recursion depth for nested objects |
| `excludedKeys` | `string[]` | `['constructor', 'prototype', ...]` | Property names to exclude |
| `includePrivate` | `boolean` | `false` | Include properties starting with `_` or `__` |
| `includeNonFunctions` | `boolean` | `false` | Include non-function exports |
| `followPrototypes` | `boolean` | `true` | Include prototype methods |
| `debug` | `boolean` | `false` | Enable verbose debug logging |

#### Returns

Array of export names as strings, including nested paths (e.g., `"foo.bar.baz"`).

### `getExports(pkg, options?): Record<string, Function>`

Extracts all callable exports (functions and classes) from a package object.

#### Parameters

- `pkg` - The package or module object to extract from
- `options` - Optional configuration object (extends `listExportNames` options)

#### Additional Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeClasses` | `boolean` | `true` | Include classes in the result |

#### Returns

Object containing all extracted functions and classes, keyed by their property paths.

### `analyzeExports(pkg, options?): AnalysisResult`

Provides comprehensive analysis of package exports.

#### Returns

```typescript
{
  functions: string[];        // Function export names
  allExports: string[];      // All export names
  summary: {
    totalFunctions: number;   // Count of function exports
    totalExports: number;     // Total export count
    hasDefault: boolean;      // Has default export
    isFunction: boolean;      // Package itself is a function
    isObject: boolean;        // Package is an object
  };
}
```

## 💡 Usage Examples

### Basic Package Analysis

```typescript
import { listExportNames } from 'export-scanner'
import * as lodash from 'lodash'

const exports = listExportNames(lodash, {
  maxDepth: 2,
  includeNonFunctions: true
})

console.log(exports)
// ['map', 'filter', 'reduce', 'debounce', 'throttle', ...]
```

### Working with Default Exports

```typescript
import { analyzeExports } from 'export-scanner'
import React from 'react'

const analysis = analyzeExports(React, {
  followPrototypes: true,
  includePrivate: false
})

console.log(analysis.summary)
// { totalFunctions: 15, hasDefault: true, ... }
```

### Extracting Callable Functions

```typescript
import * as fs from 'node:fs'
import { getExports } from 'export-scanner'

const callables = getExports(fs, {
  maxDepth: 1
})

// Now you can call functions dynamically
if (callables.readFile) {
  // callables.readFile is the actual fs.readFile function
}
```

### Debug Mode

```typescript
import { listExportNames } from 'export-scanner'

const exports = listExportNames(somePackage, {
  debug: true // Enables detailed console logging
})
```

## 🔧 Advanced Configuration

### Custom Exclusions

```typescript
const exports = listExportNames(myPackage, {
  excludedKeys: [
    'constructor',
    'prototype',
    '__internal',
    'deprecatedMethod'
  ]
})
```

### Including Private Members

```typescript
const exports = listExportNames(myPackage, {
  includePrivate: true, // Includes _private and __internal methods
  maxDepth: 5
})
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT
