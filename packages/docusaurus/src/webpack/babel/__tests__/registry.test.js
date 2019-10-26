/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const path = require('path');
const {transformFileSync} = require('@babel/core');

const plugin = require.resolve('../registry');

test('transform registry', () => {
  const {code} = transformFileSync(
    path.join(__dirname, '__fixtures__', 'registry', 'simple.js'),
    {
      plugins: ['@babel/syntax-dynamic-import', plugin],
      babelrc: false,
      configFile: false,
    },
  );
  expect(code).toMatchSnapshot();
});

test('only add webpackChunkName comment', () => {
  const {code} = transformFileSync(
    path.join(__dirname, '__fixtures__', 'registry', 'simple.js'),
    {
      plugins: [
        '@babel/syntax-dynamic-import',
        [plugin, {onlyChunkName: true}],
      ],
      babelrc: false,
      configFile: false,
    },
  );
  expect(code).toMatchSnapshot();
});

test('does not transform file without registry pragma', () => {
  const {code} = transformFileSync(
    path.join(__dirname, '__fixtures__', 'registry', 'no-pragma.js'),
    {
      plugins: ['@babel/syntax-dynamic-import', plugin],
      babelrc: false,
      configFile: false,
    },
  );
  expect(code).toMatchSnapshot();
});
