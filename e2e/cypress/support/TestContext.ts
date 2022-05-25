const dedent = require('dedent')

export default class TestContext {
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
    const {code, stdout, stderr} = await this.cy.exec(
      `python -c "${src}"`
    )
    this.log(stdout || stderr)
  }
  async cli(cmd: string) {
    src = dedent(cmd)
    this.log(cmd)
    const {code, stdout, stderr} = await this.cy.exec(cmd)
    this.log(stdout || stderr)
  }
}