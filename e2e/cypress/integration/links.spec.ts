/// <reference types="cypress" />

import TestContext from "../support/TestContext"
const path = require('path')

let ctx;
let proc;

let LINK = 'https://voxel51.com/'
describe('links', () => {
    before(async () => {
      const FIXTURES = path.join(__dirname, '..', 'fixtures')
      const IMG_PATH = path.join(FIXTURES, 'sample_img.jpeg')
      ctx = new TestContext(cy)
      proc = await ctx.py(`
        import fiftyone as fo

        sample = fo.Sample(
            filepath="${IMG_PATH}",
            link="${LINK}",
        )
        
        dataset = fo.Dataset()
        dataset.add_sample(sample)
        
        session = fo.launch_app(dataset)

        session.wait()
      `)

      cy.log('open fiftyone in browser')
      cy.visit('http://localhost:5151', {timeout: 30000})
    })

    it('should list 1 sample', () => {
      cy.contains('1 sample')
    })

    it('should allow viewing of the sample', () => {
      cy.wait(5000)
      cy.get('[title="Click to expand"]').first().click()
    })

    it('should contain a link to voxel51.com', () => {
      cy.contains(LINK).should('have.attr', 'href', LINK)
    })

    after(() => {
      proc.stop()
    })
  })