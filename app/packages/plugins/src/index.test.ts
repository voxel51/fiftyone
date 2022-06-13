import { registerComponent, PluginComponentType } from ".";

const FakeComponent: React.FunctionComponent = () => {
  return null
}

describe('registerComponent', () => {
  it('should allow for registration of components', () => {
    registerComponent({
      name: 'FakeComponent',
      type: PluginComponentType.SampleModalContent,
      component: FakeComponent
    })
  })
})