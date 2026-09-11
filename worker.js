var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
};

// node_modules/hono/dist/utils/body.js
var MAX_NESTING_DEPTH = 32;
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value, nestingState);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".", MAX_NESTING_DEPTH + 2);
  if (keys.length > MAX_NESTING_DEPTH + 1) {
    throwNestingLimitExceeded();
  }
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) {
          throwNestingLimitExceeded();
        }
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};
var throwNestingLimitExceeded = () => {
  throw new Error("Nesting limit exceeded");
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) {
    url = url.slice(0, hashIndex);
  }
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = tryDecodeURIComponent(value);
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    for (const anyCachedKey in bodyCache) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    ;
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   // Append multiple headers using the append option (e.g. Vary)
   *   c.header('Vary', 'Accept-Encoding', { append: true })
   *   c.header('Vary', 'User-Agent', { append: true })
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) {
        if (key === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) {
          if (++count > 1 || typeof headers[k] !== "string") {
            responseHeaders = new Headers();
            break;
          }
        }
      }
      if (responseHeaders) {
        for (const k in headers) {
          const v = headers[k];
          if (typeof v === "string") {
            responseHeaders.set(k, v);
          } else {
            responseHeaders.delete(k);
            for (const v2 of v) {
              responseHeaders.append(k, v2);
            }
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(methodName, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) {
            this.#addRoute(methodName, this.#path, handler);
          }
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} env - env Object
   * @param {ExecutionContext} executionCtx - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = (method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  };
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  // handler index of a dynamic path, or -1 for a static path terminal
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
        if (name && pattern[2]) {
          if (regexpStr === ".*") {
            throw PATH_ERROR;
          }
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) {
            throw PATH_ERROR;
          }
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
            throw PATH_ERROR;
          }
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
            for (const k in node.#children) {
              if (
                // a single-char pattern coexists with single-char literals as a literal does
                (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
              ) {
                throw PATH_ERROR;
              }
            }
          }
          nextNode = node.#children[regexpStr] = new _Node();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) {
            if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
              throw PATH_ERROR;
            }
          }
          nextNode = node.#children[token] = new _Node();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) {
      throw PATH_ERROR;
    }
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  // dynamic path -> [handler index, param assoc]; static paths are not registered
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    `^${path.replace(
      /\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g,
      (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ONLY_WILDCARD_REG_EXP_STR : `/:${LABEL_REG_EXP_STR}`
    )}$`
  );
}
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: createNullObject() };
    this.#routes = { [METHOD_NAME_ALL]: createNullObject() };
    this.#tries = { [METHOD_NAME_ALL]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap[METHOD_NAME_ALL]) {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") {
      path = "*";
    }
    const methods = method === METHOD_NAME_ALL ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) {
        if (!middleware[m][path]) {
          this.#insertPath(m, path);
          middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        }
      }
      for (const handlerMap of [middleware, routes]) {
        for (const m of methods) {
          for (const p in handlerMap[m]) {
            re.test(p) && handlerMap[m][p].push([handler, path]);
          }
        }
      }
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) {
      for (const m of methods) {
        if (!routes[m][path2]) {
          this.#insertPath(m, path2);
          routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || [];
        }
        routes[m][path2].push([handler, path2]);
      }
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) {
      matchers[method] = this.#buildMatcher(method);
    }
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) {
      for (const path in r) {
        const handlers = r[path];
        const pathData = trie.paths[path];
        if (!pathData) {
          staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
          continue;
        }
        handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [
          h,
          trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
            map[key] = paramReplacementMap[pathData[1][i][1]];
            return map;
          }, createNullObject())
        ]);
      }
    }
    return [regexp, indexReplacementMap.map((i) => handlerData[i]), staticMap];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node2 = class _Node2 {
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new _Node2();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) {
        possibleKeys.add(pattern[1]);
      }
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: [...possibleKeys],
        score: ++order
      }
    });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) {
            continue;
          }
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node = new Node2();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) {
      this.#node.insert(method, result, handler);
    }
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "QUERY"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
  const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
    } else if (Array.isArray(optsAllowMethods)) {
      const methodsStr = optsAllowMethods.join(",");
      return () => methodsStr;
    } else {
      return () => "";
    }
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (exposeHeadersStr) {
      set("Access-Control-Expose-Headers", exposeHeadersStr);
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        c.res.headers.append("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods) {
        set("Access-Control-Allow-Methods", allowMethods);
      }
      let headersStr = allowHeadersStr;
      if (!headersStr) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headersStr = requestHeaders.split(",").map((h) => h.trim()).join(",");
        }
      }
      if (headersStr) {
        set("Access-Control-Allow-Headers", headersStr);
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  };
};

// src/pool.ts
function maskKey(key) {
  if (!key || key.length < 8)
    return "****";
  const prefix = key.slice(0, 8);
  const suffix = key.slice(-4);
  return `${prefix}\u2022\u2022\u2022\u2022${suffix}`;
}
var _KeyPool = class {
  keys = [];
  rawKeysString = "";
  currentIndex = 0;
  constructor() {
  }
  static getInstance() {
    if (!_KeyPool.instance) {
      _KeyPool.instance = new _KeyPool();
    }
    return _KeyPool.instance;
  }
  /**
   * 同步环境变量中的 TAVILY_KEYS
   */
  syncKeys(rawConfig) {
    const trimmed = (rawConfig || "").trim();
    if (trimmed === this.rawKeysString)
      return;
    this.rawKeysString = trimmed;
    const incomingKeys = trimmed.split(/[\n,;]/).map((k) => k.trim()).filter((k) => k.length > 5);
    const oldKeyMap = /* @__PURE__ */ new Map();
    for (const item of this.keys) {
      oldKeyMap.set(item.rawKey, item);
    }
    this.keys = incomingKeys.map((k, index) => {
      const existing = oldKeyMap.get(k);
      if (existing) {
        return { ...existing, id: index + 1 };
      }
      return {
        id: index + 1,
        rawKey: k,
        maskedKey: maskKey(k),
        status: "active",
        usage: null,
        limit: null,
        plan: null,
        latency: null,
        lastUsed: null,
        lastError: null,
        cooldownUntil: null
      };
    });
    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }
  /**
   * 轮询获取下一个活跃 Key
   */
  getNextKey() {
    if (this.keys.length === 0)
      return null;
    const now = Date.now();
    const candidates = this.keys.filter(
      (k) => (k.status === "active" || k.status === "unknown") && !(k.cooldownUntil && k.cooldownUntil > now)
    );
    const targetPool = candidates.length > 0 ? candidates : this.keys;
    this.currentIndex = (this.currentIndex + 1) % targetPool.length;
    return targetPool[this.currentIndex];
  }
  recordSuccess(keyId) {
    const target = this.keys.find((k) => k.id === keyId);
    if (target) {
      target.lastUsed = Date.now();
      target.status = "active";
      target.lastError = null;
    }
  }
  recordFailure(keyId, status, errorMessage) {
    const target = this.keys.find((k) => k.id === keyId);
    if (target) {
      target.lastUsed = Date.now();
      target.status = status;
      target.lastError = errorMessage;
    }
  }
  /**
   * 429 短时限速处理：Key 保持活跃但进入冷却期，到期自动回归候选池（区别于 402/432 的真额度耗尽）
   */
  recordRateLimit(keyId, cooldownMs) {
    const target = this.keys.find((k) => k.id === keyId);
    if (target) {
      target.lastUsed = Date.now();
      target.status = "active";
      target.cooldownUntil = Date.now() + cooldownMs;
      target.lastError = `Rate Limited (429), cooling down ${Math.round(cooldownMs / 1e3)}s`;
    }
  }
  /**
   * 利用 Tavily 官方 GET /usage 接口进行 100% 零扣费健康测活与真实余额拉取！
   */
  async probeKey(item) {
    const startTime = Date.now();
    try {
      const response = await fetch("https://api.tavily.com/usage", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${item.rawKey}`
        }
      });
      const latency = Date.now() - startTime;
      item.latency = latency;
      item.lastUsed = Date.now();
      if (response.ok) {
        const data = await response.json();
        const keyUsage = data?.key?.usage ?? data?.account?.usage ?? 0;
        const keyLimit = data?.key?.limit ?? data?.account?.limit ?? 1e3;
        const planType = data?.account?.plan ?? "free";
        item.usage = keyUsage;
        item.limit = keyLimit;
        item.plan = planType;
        if (typeof keyLimit === "number" && keyLimit > 0 && keyUsage >= keyLimit) {
          item.status = "exhausted";
          item.lastError = `\u6708\u5EA6\u989D\u5EA6\u5DF2\u7528\u5C3D (${keyUsage}/${keyLimit})`;
        } else {
          item.status = "active";
          item.lastError = null;
        }
      } else if (response.status === 401) {
        item.status = "invalid";
        item.lastError = "Invalid API key (401)";
      } else if (response.status === 402 || response.status === 432) {
        item.status = "exhausted";
        item.lastError = "Payment Required (402/432)";
      } else {
        item.status = "active";
      }
    } catch (e) {
      item.latency = Date.now() - startTime;
      item.status = "unknown";
      item.lastError = e?.message || "Usage probe failed";
    }
    return item.status;
  }
  /**
   * 并发对所有 Key 执行免费额度刷新与测活
   * 分批并发：Cloudflare Workers 免费版单请求子请求上限 50，留出安全余量
   */
  async probeAll() {
    const BATCH_SIZE = 45;
    for (let i = 0; i < this.keys.length; i += BATCH_SIZE) {
      await Promise.all(this.keys.slice(i, i + BATCH_SIZE).map((k) => this.probeKey(k)));
    }
  }
  /**
   * 输出看板统计信息
   */
  getStats() {
    let active = 0;
    let exhausted = 0;
    let invalid = 0;
    let totalUsage = 0;
    let totalLimit = 0;
    let latencySum = 0;
    let latencyCount = 0;
    for (const k of this.keys) {
      if (k.status === "active")
        active++;
      else if (k.status === "exhausted")
        exhausted++;
      else if (k.status === "invalid")
        invalid++;
      if (typeof k.usage === "number")
        totalUsage += k.usage;
      if (typeof k.limit === "number")
        totalLimit += k.limit;
      if (typeof k.latency === "number" && k.latency > 0) {
        latencySum += k.latency;
        latencyCount++;
      }
    }
    const avgLatency = latencyCount > 0 ? Math.round(latencySum / latencyCount) : null;
    return {
      totalKeys: this.keys.length,
      activeKeys: active,
      exhaustedKeys: exhausted,
      invalidKeys: invalid,
      totalUsage,
      totalLimit,
      avgLatency,
      keys: this.keys.map((k) => ({
        id: k.id,
        maskedKey: k.maskedKey,
        status: k.status,
        usage: k.usage,
        limit: k.limit,
        plan: k.plan,
        latency: k.latency,
        lastUsed: k.lastUsed ? new Date(k.lastUsed).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : null,
        lastError: k.lastError
      }))
    };
  }
};
var KeyPool = _KeyPool;
__publicField(KeyPool, "instance", null);

// src/status-page.ts
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
}
function renderStatusPage(stats, token) {
  const remainingTotal = stats.totalLimit > 0 ? Math.max(0, stats.totalLimit - stats.totalUsage) : "-";
  const avgLatencyText = stats.avgLatency ? `${stats.avgLatency}ms` : "--";
  const renderKeyCard = (k) => {
    let badgeClass = "badge-active";
    let badgeText = "\u6B63\u5E38\u6D3B\u8DC3";
    let dotColor = "var(--success)";
    let statusText = k.lastUsed ? "\u{1F7E2} \u54CD\u5E94\u6B63\u5E38" : "\u{1F7E2} \u6B63\u5E38\u5C31\u7EEA";
    let statusValClass = "success-val";
    if (k.status === "exhausted") {
      badgeClass = "badge-exhausted";
      badgeText = "\u989D\u5EA6\u5DF2\u7528\u5C3D";
      dotColor = "var(--warning)";
      statusText = "\u{1F7E1} \u989D\u5EA6\u8017\u5C3D";
      statusValClass = "warning-val";
    } else if (k.status === "invalid") {
      badgeClass = "badge-invalid";
      badgeText = "\u5931\u6548/\u9519\u8BEF (401)";
      dotColor = "var(--danger)";
      statusText = "\u{1F534} \u5BC6\u94A5\u5931\u6548";
      statusValClass = "danger-val";
    }
    let progressPercent = 0;
    let progressColor = "var(--success)";
    let quotaText = "\u5C1A\u672A\u540C\u6B65\u989D\u5EA6\uFF08\u53EF\u70B9\u51FB\u53F3\u4E0A\u89D2\u6D4B\u6D3B\uFF09";
    if (typeof k.usage === "number" && typeof k.limit === "number" && k.limit > 0) {
      progressPercent = Math.min(100, Math.round(k.usage / k.limit * 100));
      const remain = Math.max(0, k.limit - k.usage);
      quotaText = `\u5DF2\u7528 ${k.usage} / ${k.limit} \u70B9 \xB7 \u5269\u4F59 ${remain} \u70B9 (${progressPercent}%) \xB7 \u8BA1\u5212: ${k.plan || "free"}`;
      if (progressPercent > 80)
        progressColor = "var(--danger)";
      else if (progressPercent > 50)
        progressColor = "var(--warning)";
    }
    let latencyDisplay = "--";
    let latencyClass = "";
    if (typeof k.latency === "number" && k.latency > 0) {
      latencyDisplay = `${k.latency}ms`;
      if (k.latency < 300)
        latencyClass = "success-val";
      else if (k.latency < 800)
        latencyClass = "warning-val";
      else
        latencyClass = "danger-val";
    }
    return `
      <div class="key-card">
        <div class="key-header">
          <div class="key-title">
            <span class="status-dot" style="background: ${dotColor};"></span>
            <span class="key-name">Key #${k.id}</span>
            <code class="key-mono">${escapeHtml(k.maskedKey)}</code>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>

        <!-- \u771F\u5B9E\u6708\u5EA6\u989D\u5EA6\u8FDB\u5EA6\u6761 (Tavily \u5B98\u65B9\u96F6\u6263\u8D39\u76F4\u8FDE\u62C9\u53D6) -->
        <div class="quota-box">
          <div class="quota-meta">
            <span>\u{1F4CA} \u6708\u5EA6\u70B9\u6570\u6D88\u8017</span>
            <span class="quota-desc">${quotaText}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progressPercent}%; background: ${progressColor};"></div>
          </div>
        </div>

        <div class="key-meta">
          <div class="meta-item">
            <span class="meta-label">\u6D4B\u6D3B\u72B6\u6001</span>
            <span class="meta-val ${statusValClass}">${statusText}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">\u6D4B\u6D3B\u5EF6\u8FDF</span>
            <span class="meta-val ${latencyClass}">${latencyDisplay}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">\u6700\u8FD1\u6D4B\u6D3B</span>
            <span class="meta-val">${k.lastUsed || "\u5C1A\u672A\u6D4B\u6D3B"}</span>
          </div>
        </div>
        ${k.lastError ? `<div class="key-error-msg">\u26A0\uFE0F ${escapeHtml(k.lastError)}</div>` : ""}
      </div>
    `;
  };
  const keysHtml = stats.keys.map(renderKeyCard).join("");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tavily Hub \xB7 \u72B6\u6001\u5927\u76D8\u4E0E\u989D\u5EA6\u76D1\u63A7</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #131b2e;
      --card-hover: #19233c;
      --border: #202b42;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #0ea5e9;
      --primary-hover: #0284c7;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 32px 16px;
      line-height: 1.5;
    }
    .container { max-width: 900px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo-badge {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0ea5e9, #38bdf8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 20px;
      color: #032b43;
    }
    h1 { font-size: 20px; font-weight: 700; }
    .subtitle { font-size: 12px; color: var(--text-muted); }
    .btn {
      background: var(--primary);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    /* Overview Stats */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
    .stat-val { font-size: 22px; font-weight: 700; }
    .stat-val.active { color: var(--success); }
    .stat-val.exhausted { color: var(--warning); }
    .stat-val.invalid { color: var(--danger); }
    .stat-val.credits { color: #38bdf8; }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .keys-container { display: flex; flex-direction: column; gap: 12px; }
    .key-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
    }
    .key-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .key-title { display: flex; align-items: center; gap: 10px; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .key-name { font-weight: 600; font-size: 14px; }
    .key-mono {
      background: #090d16;
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
      color: #cbd5e1;
    }
    .badge {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-exhausted { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-invalid { background: rgba(239, 68, 68, 0.15); color: var(--danger); }

    /* Quota Progress Bar */
    .quota-box {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }
    .quota-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
      flex-wrap: wrap;
      gap: 4px;
    }
    .quota-desc { color: var(--text-muted); font-weight: 500; }
    .progress-track {
      width: 100%;
      height: 6px;
      background: #1e293b;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
    }

    .key-meta { display: flex; gap: 24px; flex-wrap: wrap; }
    .meta-item { display: flex; flex-direction: column; gap: 2px; min-width: 100px; }
    .meta-label { font-size: 11px; color: var(--text-muted); }
    .meta-val { font-size: 13px; font-weight: 500; }
    .success-val { color: var(--success); }
    .warning-val { color: var(--warning); }
    .danger-val { color: var(--danger); }
    .key-error-msg {
      margin-top: 10px;
      padding: 6px 12px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      font-size: 12px;
      color: #fca5a5;
    }

    /* Live API Playground */
    .playground-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
      margin-top: 24px;
    }
    .playground-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .playground-title { font-weight: 600; font-size: 15px; }
    .playground-sub { font-size: 12px; color: var(--text-muted); }
    .playground-input-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .playground-input {
      flex: 1;
      min-width: 260px;
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .playground-input:focus { border-color: var(--primary); }
    .playground-input::placeholder { color: #e2e8f0 !important; opacity: 1 !important; }
    .playground-input::-webkit-input-placeholder { color: #e2e8f0 !important; opacity: 1 !important; }
    .playground-input::-moz-placeholder { color: #e2e8f0 !important; opacity: 1 !important; }
    .playground-input:-ms-input-placeholder { color: #e2e8f0 !important; }
    .search-result-area { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px; font-size: 13px; }
    .result-header { color: var(--success); font-weight: 600; margin-bottom: 10px; }
    .result-error { color: var(--danger); font-weight: 500; }
    .result-item { background: #090d16; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
    .result-title a { color: #38bdf8; font-weight: 600; text-decoration: none; font-size: 14px; }
    .result-title a:hover { text-decoration: underline; }
    .result-url { color: var(--text-muted); font-size: 11px; margin: 2px 0 6px; word-break: break-all; }
    .result-snippet { color: #cbd5e1; line-height: 1.4; font-size: 12px; }
    .hidden { display: none !important; }

    footer { margin-top: 36px; text-align: center; font-size: 12px; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">\u{1F50D}</div>
        <div>
          <h1>Tavily Hub \u72B6\u6001\u5927\u76D8</h1>
          <div class="subtitle">\u5B9E\u65F6\u8D1F\u8F7D\u5747\u8861\u4E0E\u6708\u5EA6\u989D\u5EA6\u76D1\u63A7</div>
        </div>
      </div>
      <button id="checkBtn" class="btn" onclick="checkAll()">\u26A1 \u4E00\u952E\u514D\u8D39\u6D4B\u6D3B\u4E0E\u5237\u65B0\u4F59\u989D</button>
    </header>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">\u603B\u5BC6\u94A5\u6570</div><div class="stat-val" id="statTotal">${stats.totalKeys}</div></div>
      <div class="stat-card"><div class="stat-label">\u6D3B\u8DC3\u5B58\u6D3B</div><div class="stat-val active" id="statActive">${stats.activeKeys}</div></div>
      <div class="stat-card"><div class="stat-label">\u989D\u5EA6\u8017\u5C3D</div><div class="stat-val exhausted" id="statExhausted">${stats.exhaustedKeys}</div></div>
      <div class="stat-card"><div class="stat-label">\u603B\u6C60\u5B50\u5269\u4F59\u70B9\u6570</div><div class="stat-val credits" id="statRemain">${remainingTotal}</div></div>
      <div class="stat-card"><div class="stat-label">\u5E73\u5747\u6D4B\u6D3B\u5EF6\u8FDF</div><div class="stat-val" id="statLatency">${avgLatencyText}</div></div>
    </div>

    <div class="section-title">API \u5BC6\u94A5\u5065\u5EB7\u4E0E\u5269\u4F59\u70B9\u6570</div>
    <div class="keys-container" id="keysList">${keysHtml}</div>

    <!-- \u5B9E\u65F6 API \u6D4B\u8BD5\u6C99\u76D2 -->
    <div class="playground-card">
      <div class="playground-header">
        <div class="playground-title">\u{1F9EA} \u5B9E\u65F6 Tavily API \u641C\u7D22\u6D4B\u8BD5\u6C99\u76D2</div>
        <div class="playground-sub">\u76F4\u63A5\u5411\u7F51\u5173\u53D1\u9001\u771F\u5B9E\u641C\u7D22\u8BF7\u6C42\uFF0C\u6D4B\u8BD5\u8FDE\u901A\u6027\u5E76\u5B9E\u65F6\u89C2\u5BDF\u8017\u65F6</div>
      </div>
      <div class="playground-input-group">
        <input id="searchQueryInput" class="playground-input" type="text" placeholder="\u8F93\u5165\u641C\u7D22\u5173\u952E\u8BCD\u6D4B\u8BD5\u8FDE\u901A\u6027\uFF0C\u4F8B\u5982\uFF1A\u4EBA\u5DE5\u667A\u80FD\u3001\u5F00\u6E90\u9879\u76EE\u3001\u79D1\u6280\u8D44\u8BAF..." value="" />
        <button id="searchTestBtn" class="btn" onclick="runLiveSearch()">\u{1F680} \u53D1\u9001\u771F\u5B9E Tavily \u641C\u7D22</button>
      </div>
      <div id="searchResultArea" class="search-result-area hidden"></div>
    </div>

    <footer>Tavily-Hub \xB7 Zero-Config High Availability Gateway</footer>
  </div>

  <script>
    // \u9875\u9762\u8F7D\u5165\u77AC\u95F4\u62B9\u53BB URL \u4E2D\u7684 ?token=... \u9632\u6B62\u622A\u56FE\u6CC4\u5BC6
    // \u9632\u6CE8\u5165\uFF1AJSON.stringify \u4E0D\u8F6C\u4E49 "<"\uFF0C\u624B\u52A8\u6539\u5199\u4E3A unicode \u8F6C\u4E49\u9632\u6B62\u7A81\u7834 script \u6807\u7B7E
    const secretToken = ${JSON.stringify(token).replace(/</g, "\\u003c")};

    function escHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    function renderStatsUI(stats) {
      const remain = stats.totalLimit > 0 ? Math.max(0, stats.totalLimit - stats.totalUsage) : '-';
      const avgLat = stats.avgLatency ? stats.avgLatency + 'ms' : '--';

      document.getElementById('statTotal').textContent = stats.totalKeys;
      document.getElementById('statActive').textContent = stats.activeKeys;
      document.getElementById('statExhausted').textContent = stats.exhaustedKeys;
      document.getElementById('statRemain').textContent = remain;
      document.getElementById('statLatency').textContent = avgLat;

      const container = document.getElementById('keysList');
      container.innerHTML = stats.keys.map(k => {
        let badge = 'badge-active', text = '\u6B63\u5E38\u6D3B\u8DC3', dot = 'var(--success)';
        let statusText = k.lastUsed ? '\u{1F7E2} \u54CD\u5E94\u6B63\u5E38' : '\u{1F7E2} \u6B63\u5E38\u5C31\u7EEA', statusValClass = 'success-val';
        if (k.status === 'exhausted') {
          badge = 'badge-exhausted'; text = '\u989D\u5EA6\u5DF2\u7528\u5C3D'; dot = 'var(--warning)';
          statusText = '\u{1F7E1} \u989D\u5EA6\u8017\u5C3D'; statusValClass = 'warning-val';
        } else if (k.status === 'invalid') {
          badge = 'badge-invalid'; text = '\u5931\u6548/\u9519\u8BEF (401)'; dot = 'var(--danger)';
          statusText = '\u{1F534} \u5BC6\u94A5\u5931\u6548'; statusValClass = 'danger-val';
        }

        let progressPercent = 0;
        let progressColor = 'var(--success)';
        let quotaText = '\u5C1A\u672A\u540C\u6B65\u989D\u5EA6\uFF08\u53EF\u70B9\u51FB\u53F3\u4E0A\u89D2\u6D4B\u6D3B\uFF09';

        if (typeof k.usage === 'number' && typeof k.limit === 'number' && k.limit > 0) {
          progressPercent = Math.min(100, Math.round((k.usage / k.limit) * 100));
          const r = Math.max(0, k.limit - k.usage);
          quotaText = \`\u5DF2\u7528 \${k.usage} / \${k.limit} \u70B9 \xB7 \u5269\u4F59 \${r} \u70B9 (\${progressPercent}%) \xB7 \u8BA1\u5212: \${k.plan || 'free'}\`;
          if (progressPercent > 80) progressColor = 'var(--danger)';
          else if (progressPercent > 50) progressColor = 'var(--warning)';
        }

        let latencyDisplay = '--';
        let latencyClass = '';
        if (typeof k.latency === 'number' && k.latency > 0) {
          latencyDisplay = k.latency + 'ms';
          if (k.latency < 300) latencyClass = 'success-val';
          else if (k.latency < 800) latencyClass = 'warning-val';
          else latencyClass = 'danger-val';
        }

        return \`
          <div class="key-card">
            <div class="key-header">
              <div class="key-title">
                <span class="status-dot" style="background:\${dot};"></span>
                <span class="key-name">Key #\${k.id}</span>
                <code class="key-mono">\${escHtml(k.maskedKey)}</code>
              </div>
              <span class="badge \${badge}">\${text}</span>
            </div>

            <div class="quota-box">
              <div class="quota-meta">
                <span>\u{1F4CA} \u6708\u5EA6\u70B9\u6570\u6D88\u8017</span>
                <span class="quota-desc">\${quotaText}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: \${progressPercent}%; background: \${progressColor};"></div>
              </div>
            </div>

            <div class="key-meta">
              <div class="meta-item"><span class="meta-label">\u6D4B\u6D3B\u72B6\u6001</span><span class="meta-val \${statusValClass}">\${statusText}</span></div>
              <div class="meta-item"><span class="meta-label">\u6D4B\u6D3B\u5EF6\u8FDF</span><span class="meta-val \${latencyClass}">\${latencyDisplay}</span></div>
              <div class="meta-item"><span class="meta-label">\u6700\u8FD1\u6D4B\u6D3B</span><span class="meta-val">\${k.lastUsed || '\u5C1A\u672A\u6D4B\u6D3B'}</span></div>
            </div>
            \${k.lastError ? \`<div class="key-error-msg">\u26A0\uFE0F \${escHtml(k.lastError)}</div>\` : ''}
          </div>
        \`;
      }).join('');
    }

    // \u4E00\u952E\u5065\u5EB7\u6D4B\u6D3B\u4E0E\u514D\u8D39\u4F59\u989D\u540C\u6B65\uFF080 \u6263\u8D39\uFF09
    async function checkAll() {
      const btn = document.getElementById('checkBtn');
      btn.disabled = true;
      btn.textContent = '\u23F3 \u6B63\u5728\u514D\u8D39\u62C9\u53D6\u771F\u5B9E\u989D\u5EA6\u4E0E\u6D4B\u6D3B...';
      try {
        const res = await fetch('/api/check?token=' + encodeURIComponent(secretToken), { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.stats) {
            renderStatsUI(data.stats);
          }
        } else {
          alert('\u6D4B\u6D3B\u8BF7\u6C42\u5931\u8D25');
        }
      } catch (e) {
        alert('\u6D4B\u6D3B\u5F02\u5E38: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '\u26A1 \u4E00\u952E\u514D\u8D39\u6D4B\u6D3B\u4E0E\u5237\u65B0\u4F59\u989D';
      }
    }

    // \u5B9E\u65F6 API \u6D4B\u8BD5\u6C99\u76D2
    async function runLiveSearch() {
      const input = document.getElementById('searchQueryInput');
      const btn = document.getElementById('searchTestBtn');
      const area = document.getElementById('searchResultArea');
      const q = input.value.trim();
      if (!q) return alert('\u8BF7\u8F93\u5165\u641C\u7D22\u5173\u952E\u8BCD');

      btn.disabled = true;
      btn.textContent = '\u23F3 \u6B63\u5728\u5411 Tavily \u8BF7\u6C42\u771F\u5B9E\u641C\u7D22...';
      area.classList.remove('hidden');
      area.innerHTML = '<div style="color:var(--text-muted); padding:10px 0;">\u6B63\u5728\u8F6E\u8BE2\u53EF\u7528 Key \u53D1\u9001\u8BF7\u6C42\u5E76\u83B7\u53D6\u5B9E\u65F6\u7F51\u9875\u7ED3\u679C...</div>';

      const startTime = performance.now();
      try {
        const res = await fetch('/search?token=' + encodeURIComponent(secretToken), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-status-token': secretToken
          },
          body: JSON.stringify({
            query: q,
            max_results: 2,
            search_depth: 'basic'
          })
        });
        const latency = Math.round(performance.now() - startTime);
        const data = await res.json();

        if (res.ok && data.results) {
          let html = \`<div class="result-header">\u2705 Tavily \u5B98\u65B9\u641C\u7D22\u6210\u529F\uFF01\u8017\u65F6 <b>\${latency}ms</b>\uFF0C\u8FD4\u56DE \${data.results.length} \u6761\u771F\u5B9E\u6570\u636E\uFF1A</div>\`;
          html += data.results.map((r, i) => \`
            <div class="result-item">
              <div class="result-title"><a href="\${r.url}" target="_blank">\${i+1}. \${r.title || r.url}</a></div>
              <div class="result-url">\${r.url}</div>
              <div class="result-snippet">\${r.content || '\uFF08\u65E0\u6B63\u6587\u5185\u5BB9\uFF09'}</div>
            </div>
          \`).join('');
          area.innerHTML = html;

          // \u81EA\u52A8\u5237\u65B0\u6307\u6807\u4E0E\u5269\u4F59\u70B9\u6570
          const statusRes = await fetch('/api/status?token=' + encodeURIComponent(secretToken));
          if (statusRes.ok) {
            const newStats = await statusRes.json();
            renderStatsUI(newStats);
          }
        } else {
          area.innerHTML = \`<div class="result-error">\u274C \u641C\u7D22\u5931\u8D25 (\${res.status}): \${JSON.stringify(data)}</div>\`;
        }
      } catch (err) {
        area.innerHTML = \`<div class="result-error">\u274C \u7F51\u7EDC\u8BF7\u6C42\u5F02\u5E38: \${err.message}</div>\`;
      } finally {
        btn.disabled = false;
        btn.textContent = '\u{1F680} \u53D1\u9001\u771F\u5B9E Tavily \u641C\u7D22';
      }
    }
  <\/script>
</body>
</html>`;
}

// src/index.ts
var app = new Hono2();
app.use("*", cors());
app.use("*", async (c, next) => {
  const pool = KeyPool.getInstance();
  pool.syncKeys(c.env.TAVILY_KEYS);
  await next();
});
app.get("/status", (c) => {
  const expectedToken = c.env.STATUS_TOKEN;
  const queryToken = c.req.query("token") || c.req.query("key");
  if (!expectedToken || !queryToken || queryToken !== expectedToken) {
    return c.text("Not Found", 404);
  }
  const pool = KeyPool.getInstance();
  const html = renderStatusPage(pool.getStats(), queryToken);
  return c.html(html);
});
var PROBE_MIN_INTERVAL_MS = 3e4;
var lastProbeAt = 0;
app.post("/api/check", async (c) => {
  const expectedToken = c.env.STATUS_TOKEN;
  const queryToken = c.req.query("token") || c.req.query("key");
  if (!expectedToken || !queryToken || queryToken !== expectedToken) {
    return c.text("Not Found", 404);
  }
  if (Date.now() - lastProbeAt < PROBE_MIN_INTERVAL_MS) {
    return c.json(
      { error: "Too Many Requests", message: `Health check is rate limited, retry after ${PROBE_MIN_INTERVAL_MS / 1e3}s` },
      429
    );
  }
  lastProbeAt = Date.now();
  const pool = KeyPool.getInstance();
  await pool.probeAll();
  return c.json({ success: true, stats: pool.getStats() });
});
app.get("/api/status", (c) => {
  const expectedToken = c.env.STATUS_TOKEN;
  const queryToken = c.req.query("token") || c.req.query("key");
  if (!expectedToken || !queryToken || queryToken !== expectedToken) {
    return c.text("Not Found", 404);
  }
  const pool = KeyPool.getInstance();
  return c.json(pool.getStats());
});
app.all("*", async (c) => {
  const pool = KeyPool.getInstance();
  const rawReq = c.req.raw;
  const url = new URL(rawReq.url);
  const expectedStatusToken = c.env.STATUS_TOKEN || "";
  const queryToken = c.req.query("token") || c.req.query("key");
  const statusTokenHeader = c.req.header("x-status-token");
  const isStatusAdmin = queryToken && queryToken === expectedStatusToken || statusTokenHeader && statusTokenHeader === expectedStatusToken;
  const hasBody = rawReq.method !== "GET" && rawReq.method !== "HEAD";
  let bodyJson = null;
  let rawBodyBuffer = null;
  if (hasBody) {
    const contentType = rawReq.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        bodyJson = await rawReq.json();
      } catch {
        rawBodyBuffer = await rawReq.arrayBuffer();
      }
    } else {
      rawBodyBuffer = await rawReq.arrayBuffer();
    }
  }
  const cleanToken = (str) => {
    if (!str)
      return "";
    return str.trim().replace(/^["']|["']$/g, "");
  };
  const expectedProxyToken = cleanToken(c.env.PROXY_TOKEN);
  if (expectedProxyToken.length > 0) {
    const authHeader = c.req.header("authorization") || "";
    const bearerToken = cleanToken(authHeader.replace(/^Bearer\s+/i, ""));
    const clientKey = cleanToken(
      c.req.header("x-api-key") || c.req.header("x-tavily-api-key") || (bearerToken.length > 0 ? bearerToken : null) || (bodyJson && typeof bodyJson.api_key === "string" ? bodyJson.api_key : null)
    );
    if (clientKey !== expectedProxyToken && !isStatusAdmin) {
      return c.json({
        error: "Unauthorized",
        message: "Invalid or missing proxy access token",
        hint: clientKey ? "Token mismatch. Please check your proxy access token." : "No token found in Authorization header, x-api-key, x-tavily-api-key, or request body"
      }, 401);
    }
  }
  let normalizedPath = url.pathname;
  if (normalizedPath.startsWith("/v1/")) {
    normalizedPath = normalizedPath.replace(/^\/v1\//, "/");
  }
  if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  const maxRetries = 3;
  let attempts = 0;
  while (attempts < maxRetries) {
    const keyItem = pool.getNextKey();
    if (!keyItem) {
      return c.json({ error: "Service Unavailable", message: "No active Tavily keys available" }, 503);
    }
    const upstreamParams = new URLSearchParams(url.search);
    upstreamParams.delete("token");
    upstreamParams.delete("key");
    const queryStr = upstreamParams.toString() ? "?" + upstreamParams.toString() : "";
    const targetUrl = new URL(normalizedPath + queryStr, "https://api.tavily.com");
    const upstreamHeaders = new Headers(rawReq.headers);
    upstreamHeaders.delete("x-status-token");
    upstreamHeaders.delete("x-api-key");
    upstreamHeaders.delete("x-tavily-api-key");
    upstreamHeaders.set("Authorization", `Bearer ${keyItem.rawKey}`);
    upstreamHeaders.delete("host");
    let finalBody = null;
    if (bodyJson) {
      const cloned = { ...bodyJson };
      if ("api_key" in cloned) {
        cloned.api_key = keyItem.rawKey;
      }
      finalBody = JSON.stringify(cloned);
    } else {
      finalBody = rawBodyBuffer;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2e4);
      const upstreamRes = await fetch(targetUrl.toString(), {
        method: rawReq.method,
        headers: upstreamHeaders,
        body: finalBody,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (upstreamRes.status === 401) {
        pool.recordFailure(keyItem.id, "invalid", "Tavily 401: Invalid API Key");
        try {
          await upstreamRes.body?.cancel();
        } catch {
        }
        attempts++;
        continue;
      }
      if (upstreamRes.status === 402 || upstreamRes.status === 432) {
        pool.recordFailure(keyItem.id, "exhausted", "Tavily 402/432: Credits Limit Reached");
        try {
          await upstreamRes.body?.cancel();
        } catch {
        }
        attempts++;
        continue;
      }
      if (upstreamRes.status === 429) {
        pool.recordRateLimit(keyItem.id, 6e4);
        try {
          await upstreamRes.body?.cancel();
        } catch {
        }
        attempts++;
        continue;
      }
      if (upstreamRes.ok) {
        pool.recordSuccess(keyItem.id);
      }
      const resHeaders = new Headers(upstreamRes.headers);
      resHeaders.set("access-control-allow-origin", "*");
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: resHeaders
      });
    } catch (err) {
      console.error(`[Tavily-Hub] Attempt ${attempts + 1} failed:`, err);
      attempts++;
    }
  }
  return c.json({ error: "Bad Gateway", message: "All retry attempts failed with available keys" }, 502);
});
var src_default = app;
export {
  src_default as default
};
