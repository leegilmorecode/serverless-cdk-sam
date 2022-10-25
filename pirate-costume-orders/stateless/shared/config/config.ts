// this is a basic example - but we could use https://www.npmjs.com/package/convict in production
export const config = {
  tableName: process.env?.TABLE_NAME ? process.env.TABLE_NAME : '',
};
