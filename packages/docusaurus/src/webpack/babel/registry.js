/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
module.exports = function({types: t}) {
  const REGISTRY_DIRECTIVE = /(@registry)/;

  let isRegistry = false;

  return {
    visitor: {
      Program(
        _path,
        {
          file: {
            ast: {comments},
          },
        },
      ) {
        isRegistry = false;

        if (comments) {
          // eslint-disable-next-line no-plusplus
          for (let i = 0; i < comments.length; i++) {
            if (REGISTRY_DIRECTIVE.test(comments[i].value)) {
              isRegistry = true;
              break;
            }
          }
        }
      },
      ObjectExpression(path, {opts = {}}) {
        if (!isRegistry) return;
        const properties = path.get('properties');
        const propertiesMap = {};
        properties.forEach(property => {
          const key = property.get('key');
          propertiesMap[key.node.value] = property;
        });

        if (
          !propertiesMap.loader ||
          propertiesMap.webpack ||
          propertiesMap.module
        ) {
          return;
        }

        const loaderMethod = propertiesMap.loader.get('value');
        const dynamicImports = [];

        loaderMethod.traverse({
          Import: function Import(_path) {
            dynamicImports.push(_path.parentPath);
          },
        });
        if (!dynamicImports.length) return;

        const arg = dynamicImports[0].get('arguments')[0];
        arg.addComment(
          'leading',
          ` webpackChunkName: '${path.parent.key.value}' `,
        );

        if (!opts.onlyChunkName) {
          propertiesMap.loader.insertAfter(
            t.objectProperty(
              t.identifier('webpack'),
              t.arrowFunctionExpression(
                [],
                t.callExpression(
                  t.memberExpression(
                    t.identifier('require'),
                    t.identifier('resolveWeak'),
                  ),
                  [arg.node],
                ),
              ),
            ),
          );

          propertiesMap.loader.insertAfter(
            t.objectProperty(t.identifier('module'), arg.node),
          );
        }
      },
    },
  };
};
