module.exports = {
  src: '../',
  schema: '../../../api/schema.graphql',
  exclude: ['**/node_modules/**', '**/__mocks__/**', '**/__generated__/**'],
  language: 'typescript',
  customScalars: {
    date: 'string',
    datetime: 'string'
  }
};
