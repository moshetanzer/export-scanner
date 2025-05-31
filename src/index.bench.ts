import lodash from 'lodash'
import { bench } from 'vitest'
import { analyzeExports, getExports } from './index'

bench('getExports performance', () => {
  getExports(lodash)
})

bench('analyzeExports performance', () => {
  analyzeExports(lodash)
})
