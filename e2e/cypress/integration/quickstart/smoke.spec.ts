/// <reference types="cypress" />

import TestContext from "../../support/TestContext"

function assertQuickstartLoadedInApp(app) {
  it('the app should display 200 samples', async () => {
    const hdr = app.samplesContainer.containerHeader.query()
    hdr.should.contain('200 samples')
  })
  it('should match the quickstart screenshot', () => {
    app.matchScreenshot('quickstart')
  })
  it('should have the following label types', () => {
    const expectedLabelTypes = [
      'person',
      'kite',
      'car',
      'bird',
      'carrot',
      'boat',
      'surfboard',
      'traffic light',
      'airplane'
    ]

    app.horizontalNav.plotButtons.query().contains('Labels').click()

    for (const expected of expectedLabelTypes) {
      app.horizontalNav.query().should('contain', expected)
    }
  })
}

let ctx;

describe('quickstart', () => {
  describe('python smoke tests', () => {
    before(async () => {
      ctx = new TestContext(cy)
  
      await ctx.py(`
        import fiftyone as fo
        import fiftyone.zoo as foz
        
        dataset = foz.load_zoo_dataset("quickstart")
        session = fo.launch_app(dataset)
      `)
    })
    assertQuickstartLoadedInApp(ctx.app)
  })
  
  describe('cli smoke tests', () => {
    before(async () => {
      ctx = new TestContext(cy)
      await ctx.cli('fiftyone quickstart')
      await app.ready()
    })
    assertQuickstartLoadedInApp(ctx.app)
  })
})