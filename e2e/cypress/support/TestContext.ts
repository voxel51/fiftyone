const dedent = require('dedent')
const fetch = require('isomorphic-fetch')



export default class TestContext {
  private processes: Map<string, Process> = new Map();
  constructor(private cy: Cypress.cy) {
    
  }
  log(msg: string) {
    if (typeof msg === 'string') {
      for (const line of msg.split('\n')) {
        this.cy.log(line)
      }
    }
  }
  async py(src: string) {
    src = dedent(src)
    this.log(src)
    const resp = await fetch('http://localhost:3005/exec', {
      method: 'POST',
      body: JSON.stringify({py: src}),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    console.log(resp)
    const result = await resp.json()
    console.log(result)
    const proc = new Process(result.id)
    this.processes.set(result.id, proc)
    console.log('done')
    return proc
  }
  async cli(cmd: string) {
    cmd = dedent(cmd)
    this.log(cmd)
    const {code, stdout, stderr} = await this.cy.exec(cmd)
    this.log(stdout || stderr)
  }
}

class Process {
  constructor(public id: string){}
  async stop() {
    const resp = await fetch({
      method: 'POST',
      url: `http://localhost:3005/stop/${this.id}`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
  }
}