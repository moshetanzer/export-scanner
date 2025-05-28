import lodash from 'lodash'
import { bench } from 'vitest'
import { analyzePackage, getExports } from './index'

bench('getExports performance', () => {
  getExports(lodash)
})

bench('analyzeExports performance', () => {
  analyzePackage(lodash)
})
