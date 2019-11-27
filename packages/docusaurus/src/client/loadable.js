/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React from 'react';
import {useSubscription} from 'use-subscription';
import {LoadableContext} from './loadable-context';

const ALL_INITIALIZERS = [];
const READY_INITIALIZERS = [];

function isWebpackReady(getModuleIds) {
  if (typeof __webpack_modules__ !== 'object') {
    return false;
  }

  return getModuleIds().every(moduleId => {
    return (
      typeof moduleId !== 'undefined' &&
      typeof __webpack_modules__[moduleId] !== 'undefined'
    );
  });
}

function load(loader) {
  const promise = loader();

  const state = {
    loading: true,
    loaded: null,
    error: null,
  };

  state.promise = promise
    .then(loaded => {
      state.loading = false;
      state.loaded = loaded;
      return loaded;
    })
    .catch(err => {
      state.loading = false;
      state.error = err;
      throw err;
    });

  return state;
}

function loadMap(obj) {
  const state = {
    loading: false,
    loaded: {},
    error: null,
  };

  const promises = [];

  try {
    Object.keys(obj).forEach(key => {
      const result = load(obj[key]);

      if (!result.loading) {
        state.loaded[key] = result.loaded;
        state.error = result.error;
      } else {
        state.loading = true;
      }

      promises.push(result.promise);

      result.promise
        .then(res => {
          state.loaded[key] = res;
        })
        .catch(err => {
          state.error = err;
        });
    });
  } catch (err) {
    state.error = err;
  }

  state.promise = Promise.all(promises)
    .then(res => {
      state.loading = false;
      return res;
    })
    .catch(err => {
      state.loading = false;
      throw err;
    });

  return state;
}

function resolve(obj) {
  return obj && obj.__esModule ? obj.default : obj;
}

function render(loaded, props) {
  return React.createElement(resolve(loaded), props);
}

function createLoadableComponent(loadFn, options) {
  if (!options.loading) {
    throw new Error('react-loadable requires a `loading` component');
  }

  const opts = {
    loader: null,
      loading: null,
      delay: 200,
      timeout: null,
      render,
      webpack: null,
      modules: null,
    ...options,
  };

  let subscription = null;

  function init() {
    if (!subscription) {
      const sub = new LoadableSubscription(loadFn, opts);
      subscription = {
        getCurrentValue: sub.getCurrentValue.bind(sub),
        subscribe: sub.subscribe.bind(sub),
        retry: sub.retry.bind(sub),
        promise: sub.promise.bind(sub),
      };
    }
    return subscription.promise();
  }

  ALL_INITIALIZERS.push(init);

  if (typeof opts.webpack === 'function') {
    READY_INITIALIZERS.push(() => {
      if (isWebpackReady(opts.webpack)) {
        return init();
      }
    });
  }

  const LoadableComponent = (props, ref) => {
    init();

    const context = React.useContext(LoadableContext);
    const state = useSubscription(subscription);

    React.useImperativeHandle(ref, () => ({
      retry: subscription.retry,
    }));

    if (context && Array.isArray(opts.modules)) {
      opts.modules.forEach(moduleName => {
        context(moduleName);
      });
    }

    if (state.loading || state.error) {
      return React.createElement(opts.loading, {
        isLoading: state.loading,
        pastDelay: state.pastDelay,
        timedOut: state.timedOut,
        error: state.error,
        retry: subscription.retry,
      });
    } if (state.loaded) {
      return opts.render(state.loaded, props);
    } 
      return null;
    
  };

  LoadableComponent.preload = () => init();
  LoadableComponent.displayName = 'LoadableComponent';

  return React.forwardRef(LoadableComponent);
}

class LoadableSubscription {
  constructor(loadFn, opts) {
    this._loadFn = loadFn;
    this._opts = opts;
    this._callbacks = new Set();
    this._delay = null;
    this._timeout = null;

    this.retry();
  }

  promise() {
    return this._res.promise;
  }

  retry() {
    this._clearTimeouts();
    this._res = this._loadFn(this._opts.loader);

    this._state = {
      pastDelay: false,
      timedOut: false,
    };

    const {_res: res, _opts: opts} = this;

    if (res.loading) {
      if (typeof opts.delay === 'number') {
        if (opts.delay === 0) {
          this._state.pastDelay = true;
        } else {
          this._delay = setTimeout(() => {
            this._update({
              pastDelay: true,
            });
          }, opts.delay);
        }
      }

      if (typeof opts.timeout === 'number') {
        this._timeout = setTimeout(() => {
          this._update({timedOut: true});
        }, opts.timeout);
      }
    }

    this._res.promise
      .then(() => {
        this._update();
        this._clearTimeouts();
      })
      // eslint-disable-next-line handle-callback-err
      .catch(err => {
        this._update();
        this._clearTimeouts();
      });
    this._update({});
  }

  _update(partial) {
    this._state = {
      ...this._state,
      ...partial,
    };
    this._callbacks.forEach(callback => callback());
  }

  _clearTimeouts() {
    clearTimeout(this._delay);
    clearTimeout(this._timeout);
  }

  getCurrentValue() {
    return {
      ...this._state,
      error: this._res.error,
      loaded: this._res.loaded,
      loading: this._res.loading,
    };
  }

  subscribe(callback) {
    this._callbacks.add(callback);
    return () => {
      this._callbacks.delete(callback);
    };
  }
}

function Loadable(opts) {
  return createLoadableComponent(load, opts);
}

function LoadableMap(opts) {
  if (typeof opts.render !== 'function') {
    throw new Error('LoadableMap requires a `render(loaded, props)` function');
  }

  return createLoadableComponent(loadMap, opts);
}

Loadable.Map = LoadableMap;

function flushInitializers(initializers) {
  const promises = [];

  while (initializers.length) {
    const init = initializers.pop();
    promises.push(init());
  }

  return Promise.all(promises).then(() => {
    if (initializers.length) {
      return flushInitializers(initializers);
    }
  });
}

Loadable.preloadAll = () => {
  return new Promise((resolve, reject) => {
    flushInitializers(ALL_INITIALIZERS).then(resolve, reject);
  });
};

Loadable.preloadReady = () => {
  return new Promise((resolve, reject) => {
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS).then(resolve, resolve);
  });
};

export default Loadable;
