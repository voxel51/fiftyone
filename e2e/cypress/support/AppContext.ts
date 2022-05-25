export default class AppContext {
    public flashlight: TestableComponent
    constructor(private cy: Cypress.cy) {
        this.flashlight = new TestableComponent()
    }
}

class TestableComponent {
    constructor(private cy: Cypress.cy) {

    }
}

