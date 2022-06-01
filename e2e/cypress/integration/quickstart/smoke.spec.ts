/// <reference types="cypress" />

import TestContext from "../../support/TestContext"

let ctx;
let proc;

describe('quickstart', () => {
  describe('smoke tests', () => {
    before(async () => {
      ctx = new TestContext(cy)
      proc = await ctx.py(`
        import fiftyone as fo
        import fiftyone.zoo as foz
        
        ZOO_DATASET = "quickstart"
        
        if fo.dataset_exists(ZOO_DATASET):
            dataset = fo.load_dataset(ZOO_DATASET)
        else:
            dataset = foz.load_zoo_dataset(ZOO_DATASET)
        
        session = fo.launch_app(dataset)
        
        session.wait()
      `)

      cy.visit('http://localhost:5151', {timeout: 30000})
    })
    it('should have 200 samples', () => {
      cy.contains('200 samples')
    })

    const labels = [
      'Sample tags',
      'Label tags',
      'Labels',
      'Other fields',
      'Hide',
      ['Hide sidebar', () => cy.get('[title="Hide sidebar"]')],
      ['Show sidebar', () => cy.get('[title="Show sidebar"]')],
      ['Display options', () => cy.get('[title="Display options"]')],
      ['Tag samples or labels', () => cy.get('[title="Tag samples or labels"]')],
      ['Patches', () => cy.get('[title="Patches"]')],
      ['Flashlight', () => cy.get('canvas').first()],
      ['Hide sidebar', () => cy.get('#modal [title="Hide sidebar"]')],
    ]

    for (const label of labels) {
      switch (typeof label) {
        case 'string':
          it(`${label} should be clickable`, () => {
            cy.wait(1000)
            cy.contains(label).click()
          })
          break;
        case 'object':
          const [title, fn] = label
          it(`${title} should be clickable`, () => {
            cy.wait(1000)
            fn().click()
          })
          break
      }
    }

    it('can navigate through samples', () => {
      for (let i = 0; i < 10; i++) {
        cy.get('#modal').type('{rightArrow}')
        cy.wait(500)
      }
    })

    it('can close the modal with the esc key', () => {
      // clear the selection
      cy.get('body').type('{esc}')
      // close the modal
      cy.get('body').type('{esc}')
    })

    after(() => {
      proc.stop()
    })
  })
  
  describe('take 10', () => {
    before(async () => {
      ctx = new TestContext(cy)
      proc = await ctx.py(`
        import fiftyone as fo
        import fiftyone.zoo as foz
        
        ZOO_DATASET = "quickstart"
        
        if fo.dataset_exists(ZOO_DATASET):
            dataset = fo.load_dataset(ZOO_DATASET)
        else:
            dataset = foz.load_zoo_dataset(ZOO_DATASET)
        
        session = fo.launch_app(dataset)
        
        session.view = dataset.take(10)

        session.wait()
      `)

      cy.log('open fiftyone in browser')
      cy.visit('http://localhost:5151', {timeout: 30000})
    })

    it('should have 10 samples', () => {
      cy.contains('10 samples')
    })

    after(() => {
      proc.stop()
    })
  })
  
})