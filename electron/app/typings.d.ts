declare module "react-dom" {
  interface ReactDOM {
    createRoot(root: any): any;
    unmountComponentAtNode(root: any): any;
  }

  export = ReactDom;
}
