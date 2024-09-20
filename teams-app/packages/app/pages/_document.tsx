import { createRelayDocument, RelayDocument } from 'relay-nextjs/document';
import NextDocument, {
  Html,
  Head,
  DocumentContext,
  Main,
  NextScript
} from 'next/document';

interface DocumentProps {
  relayDocument: RelayDocument;
}

class Document extends NextDocument<DocumentProps> {
  static async getInitialProps(ctx: DocumentContext) {
    const relayDocument = createRelayDocument();

    const renderPage = ctx.renderPage;
    ctx.renderPage = () =>
      renderPage({
        enhanceApp: (App) => relayDocument.enhance(App)
      });

    const initialProps = await NextDocument.getInitialProps(ctx);

    return {
      ...initialProps,
      relayDocument
    };
  }

  render() {
    const { relayDocument } = this.props;

    return (
      <Html>
        <Head>
          <relayDocument.Script />
        </Head>
        <body style={{ background: 'var(--mui-palette-background-secondary)' }}>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default Document;
