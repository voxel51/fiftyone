import {start} from './index'

console.log('starting fiftyone e2e tests...')

start().catch(e => {
  console.error(e)
  process.exit(1)
})