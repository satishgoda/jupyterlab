// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Contents, ContentsManager, Session, utils
} from '@jupyterlab/services';

import {
  IIterable, IterableOrArrayLike
} from 'phosphor/lib/algorithm/iteration';

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  find
} from 'phosphor/lib/algorithm/searching';

import {
  Vector
} from 'phosphor/lib/collections/vector';

import {
  Token
} from 'phosphor/lib/core/token';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  ISanitizer
} from '../common/sanitizer';

import {
  HTMLRenderer, LatexRenderer, ImageRenderer, TextRenderer,
  JavascriptRenderer, SVGRenderer, MarkdownRenderer, PDFRenderer
} from '../renderers';


/* tslint:disable */
/**
 * The rendermime token.
 */
export
const IRenderMime = new Token<IRenderMime>('jupyter.services.rendermime');
/* tslint:enable */


/**
 * The rendermime interface.
 */
export
interface IRenderMime extends RenderMime {}


/**
 * A composite renderer.
 *
 * #### Notes
 * When rendering a mimebundle, a mimetype is selected from the mimetypes by
 * searching through the `this.order` list. The first mimetype found in the
 * bundle determines the renderer that will be used.
 *
 * You can add a renderer by adding it to the `renderers` object and
 * registering the mimetype in the `order` array.
 *
 * Untrusted bundles are handled differently from trusted ones.  Untrusted
 * bundles will only render outputs that can be rendered "safely"
 * (see [[RenderMime.IRenderer.isSafe]]) or can be "sanitized"
 * (see [[RenderMime.IRenderer.isSanitizable]]).
 */
export
class RenderMime {
  /**
   * Construct a renderer.
   */
  constructor(options: RenderMime.IOptions) {
    for (let mime in options.renderers) {
      this._renderers[mime] = options.renderers[mime];
    }
    this._order = new Vector(options.order);
    this._sanitizer = options.sanitizer;
    this._resolver = options.resolver || null;
    this._handler = options.linkHandler || null;
  }

  /**
   * The object used to resolve relative urls for the rendermime instance.
   */
  get resolver(): RenderMime.IResolver {
    return this._resolver;
  }
  set resolver(value: RenderMime.IResolver) {
    this._resolver = value;
  }

  /**
   * The object used to handle path opening links.
   */
  get linkHandler(): RenderMime.ILinkHandler {
    return this._handler;
  }
  set linkHandler(value: RenderMime.ILinkHandler) {
    this._handler = value;
  }

  /**
   * Get an iterator over the ordered list of mimetypes.
   *
   * #### Notes
   * These mimetypes are searched from beginning to end, and the first matching
   * mimetype is used.
   */
  mimetypes(): IIterable<string> {
    return this._order.iter();
  }

  /**
   * Render a mimebundle.
   *
   * @param bundle - the mimebundle to render.
   *
   * @param trusted - whether the bundle is trusted.
   *
   * #### Notes
   * We select the preferred mimetype in bundle based on whether the output is
   * trusted (see [[preferredMimetype]]), and then pass a sanitizer to the
   * renderer if the output should be sanitized.
   */
  render(options: RenderMime.IRenderOptions<string | JSONObject>): Widget {
    let { trusted, bundle, injector } = options;
    let mimetype = this.preferredMimetype(bundle, trusted);
    if (!mimetype) {
      return void 0;
    }
    let rendererOptions = {
      mimetype,
      source: bundle[mimetype],
      injector,
      resolver: this._resolver,
      sanitizer: trusted ? null : this._sanitizer,
      linkHandler: this._handler
    };
    return this._renderers[mimetype].render(rendererOptions);
  }

  /**
   * Find the preferred mimetype in a mimebundle.
   *
   * @param bundle - the mimebundle giving available mimetype content.
   *
   * @param trusted - whether the bundle is trusted.
   *
   * #### Notes
   * For untrusted bundles, only select mimetypes that can be rendered
   * "safely"  (see [[RenderMime.IRenderer.isSafe]]) or can  be "sanitized"
   * (see [[RenderMime.IRenderer.isSanitizable]]).
   */
  preferredMimetype(bundle: RenderMime.MimeMap<string | JSONObject>, trusted=false): string {
    return find(this._order, m => {
      if (m in bundle) {
        let renderer = this._renderers[m];
        if (trusted || renderer.isSafe(m) || renderer.isSanitizable(m)) {
          return true;
        }
      }
    });
  }

  /**
   * Clone the rendermime instance with shallow copies of data.
   */
  clone(): IRenderMime {
    return new RenderMime({
      renderers: this._renderers,
      order: this._order.iter(),
      sanitizer: this._sanitizer,
      linkHandler: this._handler
    });
  }

  /**
   * Add a renderer by mimetype.
   *
   * @param mimetype - The mimetype of the renderer.
   * @param renderer - The renderer instance.
   * @param index - The optional order index.
   *
   * ####Notes
   * Negative indices count from the end, so -1 refers to the penultimate index.
   * Use the index of `.order.length` to add to the end of the render precedence list,
   * which would make the new renderer the last choice.
   */
  addRenderer(mimetype: string, renderer: RenderMime.IRenderer, index = 0): void {
    this._renderers[mimetype] = renderer;
    this._order.insert(index, mimetype);
  }

  /**
   * Remove a renderer by mimetype.
   *
   * @param mimetype - The mimetype of the renderer.
   */
  removeRenderer(mimetype: string): void {
    delete this._renderers[mimetype];
    this._order.remove(mimetype);
  }

  /**
   * Get a renderer by mimetype.
   *
   * @param mimetype - The mimetype of the renderer.
   *
   * @returns The renderer for the given mimetype, or undefined if the mimetype is unknown.
   */
  getRenderer(mimetype: string): RenderMime.IRenderer {
    return this._renderers[mimetype];
  }

  private _renderers: RenderMime.MimeMap<RenderMime.IRenderer> = Object.create(null);
  private _order: Vector<string>;
  private _sanitizer: ISanitizer = null;
  private _resolver: RenderMime.IResolver | null;
  private _handler: RenderMime.ILinkHandler | null;
}


/**
 * The namespace for RenderMime statics.
 */
export
namespace RenderMime {
  /**
   * The options used to initialize a rendermime instance.
   */
  export
  interface IOptions {
    /**
     * A map of mimetypes to renderers.
     */
    renderers: MimeMap<IRenderer>;

    /**
     * A list of mimetypes in order of precedence (earliest has precedence).
     */
    order: IterableOrArrayLike<string>;

    /**
     * The sanitizer used to sanitize html inputs.
     */
    sanitizer: ISanitizer;

    /**
     * The initial resolver object.
     *
     * The default is `null`.
     */
    resolver?: IResolver;

    /**
     * An optional path handler.
     */
    linkHandler?: ILinkHandler;
  }

  /**
   * Valid rendered object type.
   */
  export
  type RenderedObject = HTMLElement | Widget;

  /**
   * A map of mimetypes to types.
   */
  export
  type MimeMap<T> = { [mimetype: string]: T };

  /**
   * Default renderer order
   */
  export
  function defaultRenderers(): IRenderer[] {
    return [
      new JavascriptRenderer(),
      new HTMLRenderer(),
      new MarkdownRenderer(),
      new LatexRenderer(),
      new SVGRenderer(),
      new ImageRenderer(),
      new PDFRenderer(),
      new TextRenderer()
    ];
  }

  /**
   * The interface for a renderer.
   */
  export
  interface IRenderer {
    /**
     * The mimetypes this renderer accepts.
     */
    readonly mimetypes: string[];

    /**
     * Whether the input is safe without sanitization.
     *
     * #### Notes
     * A `safe` output is one that cannot pose a security threat
     * when added to the DOM, for example when text is added with
     * `.textContent`.
     */
    isSafe(mimetype: string): boolean;

    /**
     * Whether the input can safely sanitized for a given mimetype.
     *
     * #### Notes
     * A `sanitizable` output is one that could pose a security threat
     * if not properly sanitized, but can be passed through an html sanitizer
     * to render it safe.  These are typically added to the DOM using
     * `.innerHTML` or equivalent.
     */
    isSanitizable(mimetype: string): boolean;

    /**
     * Render the transformed mime bundle.
     *
     * @param options - The options used for rendering.
     */
    render(options: IRendererOptions<string | JSONObject>): Widget;
  }

  /**
   * The options used to render a mime map.
   */
  export
  interface IRenderOptions<T extends string | JSONObject> {
    /**
     * The mime bundle to render.
     */
    bundle: MimeMap<T>;

    /**
     * A callback that can be used to add a mimetype to the original bundle.
     */
    injector?: IInjector;

    /**
     * Whether the mime bundle is trusted (the default is False).
     */
    trusted?: boolean;
  }

  /**
   * The options used to transform or render mime data.
   */
  export
  interface IRendererOptions<T extends string | JSONObject> {
    /**
     * The mimetype.
     */
    mimetype: string;

    /**
     * The source data.
     */
    source: T;

    /**
     * A callback that can be used to add a mimetype to the original bundle.
     */
    injector?: IInjector;

    /**
     * An optional url resolver.
     */
    resolver?: IResolver;

    /**
     * An optional html sanitizer.
     *
     * If given, should be used to sanitize raw html.
     */
    sanitizer?: ISanitizer;

    /**
     * An optional link handler.
     */
    linkHandler?: ILinkHandler;
  }

  /**
   * An object that handles injecting mime types into a mime bundle.
   */
  export
  interface IInjector {
    /**
     * Test if the bundle has the given mimeType.
     */
    has(mimeType: string): boolean;

    /**
     * Inject a value into the mime bundle.
     *
     * #### Notes
     * This will be a no-op if the bundle already has the given mimeType.
     */
    add(mimeType: string, value: string | JSONObject): void;
  }

  /**
   * An object that handles links on a node.
   */
  export
  interface ILinkHandler {
    /**
     * Add the link handler to the node.
     */
    handleLink(node: HTMLElement, url: string): void;
  }

  /**
   * An object that resolves relative URLs.
   */
  export
  interface IResolver {
    /**
     * Resolve a relative url to a correct server path.
     */
    resolveUrl(url: string): Promise<string>;

    /**
     * Get the download url of a given absolute server path.
     */
    getDownloadUrl(path: string): Promise<string>;
  }

  /**
   * A default resolver that uses a session and a contents manager.
   */
  export
  class UrlResolver implements IResolver {
    /**
     * Create a new url resolver for a console.
     */
    constructor(options: IUrlResolverOptions) {
      this._session = options.session;
      this._contents = options.contents;
    }

    /**
     * Resolve a relative url to a correct server path.
     */
    resolveUrl(url: string): Promise<string> {
      // Ignore urls that have a protocol.
      if (utils.urlParse(url).protocol || url.indexOf('//') === 0) {
        return Promise.resolve(url);
      }
      let path = this._session.path;
      let cwd = ContentsManager.dirname(path);
      path = ContentsManager.getAbsolutePath(url, cwd);
      return Promise.resolve(path);
    }

    /**
     * Get the download url of a given absolute server path.
     */
    getDownloadUrl(path: string): Promise<string> {
      // Ignore urls that have a protocol.
      if (utils.urlParse(path).protocol || path.indexOf('//') === 0) {
        return Promise.resolve(path);
      }
      return this._contents.getDownloadUrl(path);
    }

    private _session: Session.ISession;
    private _contents: Contents.IManager;
  }

  /**
   * The options used to create a UrlResolver.
   */
  export
  interface IUrlResolverOptions {
    /**
     * The session used by the resolver.
     */
    session: Session.ISession;

    /**
     * The contents manager used by the resolver.
     */
    contents: Contents.IManager;
  }
}
