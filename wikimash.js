/*
 * This script should work without modification in virtually any modern browser.
 *
 * To support older browsers the following features must be polyfilled:
 *   - Array.prototype.forEach
 *   - Array.prototype.filter
 *   - Array.protoype.map
 *   - Object.keys
 *   - Promise
 * 
 */

(function() { // this function closure wraps the entire script

"use strict";

/* ===========
    CONSTANTS
   =========== */

/**
 * Maximum wait time in ms for ajax requests.
 * @constant {number}
 */
var REQUEST_TIMEOUT = 5000;

/**
 * Delay in ms for responses to user action.
 * @constant {number}
 */
var STANDARD_DELAY = 250;

/**
 * The oldest version of MediaWiki server supported.
 * @constant {string}
 */
var MIN_MEDIAWIKI_VERSION = "1.24";

/**
 * Pattern that matches a positive integer.
 * @constant {RegExp}
 */
var POSITIVE_INT_REGEX = /^[0-9]+$/;

/** 
 * Pattern that matches a valid hostname.
 * @constant {RegExp}
 */
var VALID_HOSTNAME_REGEX = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

/**
 * List of wikipedia languages to be display in the 'change wiki' menu.
 * Keys are the corresponding WP Code (eg. de -> de.wikipedia.org).
 * The first element in the array is the language's native name.
 * The second element is the language's english name.
 * @constant {Object}
 */
var WIKIPEDIA_LANGUAGES = {
  en: ["English", "English"],
  de: ["Deutsch", "German"],
  fr: ["Français", "French"],
  es: ["Español", "Spanish"],
  ru: ["Русский", "Russian"],
  ja: ["日本語", "Japanese"],
  nl: ["Nederlands", "Dutch"],
  it: ["Italiano", "Italian"],
  sv: ["Svenska", "Swedish"],
  pl: ["Polski", "Polish"],
  vi: ["Tiếng Việt", "Vietnamese"],
  pt: ["Português", "Portugese"],
  ar: ["العَرَبِيَّة‎", "Arabic"],
  zh: ["汉语", "Chinese"],
  uk: ["Українська", "Ukrainian"],
  ca: ["Català", "Catalan"],
  no: ["Bokmål", "Norwegian Bokmål"],
  fi: ["Suomi", "Finnish"],
  cs: ["Čeština", "Czech"],
  hu: ["Magyar", "Hungarian"],
  ko: ["한국어", "Korean"],
  id: ["Bahasa Indonesia", "Indonesian"],
  he: ["עִבְרִית‎", "Hebrew"],
  fa: ["فارسی", "Persian"],
  th: ["ภาษาไทย", "Thai"],
  hi: ["हिन्दी", "Hindi"],
  bn: ["বাংলা", "Bengali"]
};

/**
 * Inline HTML icons in various formats.
 * @constant {Object}
 */
var ICONS = {
  svg: {
    check: '<svg viewBox="0 0 32 24"><polyline points="31,1 9,22 1,14"/></svg>',
    x: '<svg viewBox="0 0 32 24"><line x1="5" y1="1" x2="27" y2="23"/><line x1="5" y1="23" x2="27" y2="1"/></svg>',
    sync: '<svg viewBox="0 0 32 24"><path class="st0" d="M16,3c5,0,9,4,9,9c0,2.1-0.8,4.1-2,5.7"/><polygon points="12,3 16,6 16,0"/><path class="st0" d="M16,21c-5,0-9-4-9-9c0-2.1,0.8-4.1,2-5.7"/><polygon points="20,21 16,18 16,24"/></svg>',
    dice: '<svg viewBox="0 0 32 24"><rect x="9" y="10" width="3" height="3"/><rect x="20" y="10" width="3" height="3"/><rect x="9" y="3" width="3" height="3"/><rect x="20" y="3" width="3" height="3"/><rect x="9" y="17" width="3" height="3"/><rect x="20" y="17" width="3" height="3"/></svg>',
    arrow: '<svg viewBox="0 0 32 24"><polyline points="8,14 16,22 24,14"/><line x1="16" y1="0" x2="16" y2="22"/></svg>'
  }
}

/**
 * Whether inline HTML SVGs are supported.
 * @constant {boolean}
 */
var SVG_SUPPPORTED = !!(document.createElementNS && document.createElementNS('http://www.w3.org/2000/svg','svg').createSVGRect);

/**
 * Whether cross-domain xhr requests are support.
 * Use by 'makeApiRequest' to determine which request technique should be used.
 */
var XDOMAIN_XHR_SUPPORTED = 'withCredentials' in new XMLHttpRequest();


/* ==================
    COMMON VARIABLES
   ================== */

/**
 * The parsed url query string. This is set by the 'resetPage' function.
 * @type {Object.<string,string>}
 */
var query;

/**
 * The API instance that is used by all supporting functions.
 * This is set by the 'setupAPI' function.
 * @type {MediaWikiAPI}
 */
var mediaWikiAPI;

/**
 * The fetcher that is used to cache requests for random articles.
 * This is set by the 'setupAPI' function.
 * @type {RandomArticleFetcher}
 */
var randomArticleFetcher;

/**
 * The number of JSONP requests that have been made with 'jsonpAPIRequest'.
 * This is used to create unique callback identifiers.
 * @type {number}
 */
var jsonpRequestCount = 0;

/**
 * The div that contains all the applications content.
 * All visible page content aside from the header and footer are in here.
 * @type {HTMLDivElement}
 */
var content = document.getElementById("content");

/**
 * An alternative to document.head to support Internet Explorer 8.
 * @type {HTMLHeadElement}
 */
var head = document.head || document.getElementsByTagName("head")[0];

/**
 * An alternative to the history API to support Internet Explorer 8.
 */
var history; 
if (window.history && window.history.pushState && window.history.replaceState)
  history = window.history;
else {
  function openState(state, title, url) {
    window.open(url, "_self");
  }
  history = {
    pushState: openState,
    replaceState: openState
  };
}


/* ===================
    UTILITY FUNCTIONS
   =================== */

/**
 * Attempts to copy a string to the users clipboard.
 * @param {string} text - The string to copy.
 * @returns {boolean} Whether string was succesfully copied.
 */
function copyStringToClipboard(text) {

  // create a textarea to copy from
  var textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);

  // select the text in the textarea
  textArea.focus();
  textArea.select();

  // copy may fail depending on browser compatibility
  var outcome;
  try {
    outcome = document.execCommand('copy');
  }
  catch (error) {
    outcome = false;
  }

  // clean up
  document.body.removeChild(textArea);

  return outcome;

}

/**
 * Converts a version string to its individual numerical components.
 * @param {string} version - The version string (eg. 1.4.2).
 * @returns {number[]} The curresponding numeric values (eg. [1,4,2]).
 */
function parseVersionString(version) {

  return version.split(".").map(function(n) {
    if (POSITIVE_INT_REGEX.test(n))
      return parseInt(n, 10);
    else
      throw new Error("Invalid version string: " + version);
  });

}

/**
 * Determines whether one version is a at least as recent as another.
 * @param {string} version - The version string that will be checked.
 * @param {string} minVersion - The version string that will be checked against.
 * @returns {boolean} 'version' >= 'minVersion'.
 */
function atLeastVersion(version, minVersion) {

  // parse the version strings to arrays of their numerical components
  var v1 = parseVersionString(version);
  var v2 = parseVersionString(minVersion);

  // compare the versions and return the result
  for (var i = 0; i < v2.length; i++) {
    if (i >= v1.length)
      return false;
    if (v1[i] > v2[i])
      return true;
    if (v1[i] < v2[i])
      return false;
  }

  return true; // default

}

/**
 * Converts a URL query string to a object with the corresponding values.
 * @param {string} queryString - The query string with the leading '?'.
 * @returns {Object.<string,string>} Object where query parameters are keys.
 */
function parseQueryString(queryString) {

  queryString = queryString.slice(1); // remove leading "?"

  var result = {};

  // delimit by ampersand and parse individual pairs
  queryString.split('&').forEach(function(pairString) {

    var pair = pairString.split("=");
    if (pair.length != 2) // pair must have exactly one '='
      return;

    var key = decodeURIComponent(pair[0]);
    var value = decodeURIComponent(pair[1]);

    // pair must have a key
    if (key.length == 0)
      return;

    result[key] = value;

  });

  return result;

}

/**
 * Converts and object to a corresponding query string.
 * @param {Object.<string,string>} query - Object with parmaters and values.
 * @returns {string} The generated query string with leading '?'.
 */
function encodeQuerystring(query) {

  var queryString = "?";

  // iterate over keys of query object
  Object.keys(query).forEach(function(key) {

    var value = query[key];

     // don't include pairs with undefined or null values
    if (value === undefined || value === null)
      return;

    // add an amperand delimeter if atleast one pair has already been parsed
    if (queryString.length > 1)
      queryString += '&';

    queryString += encodeURIComponent(key) + '=' + encodeURIComponent(value);

  });

  return queryString;

};

/**
 * Create an anchor tag that calls a javascript function when clicked.
 * @param {string} text - The inner text of the link.
 * @param {function} onclick - The function to be called when clicked.
 * @returns {HTMLAnchorElement} The created anchor tag.
 */
function createJSLink(text, onclick) {
  
  var link = document.createElement("a");
  link.href = "javascript:void(0);";
  link.innerText = text;
  link.onclick = onclick;
  return link;

}

/**
 * Sets the inner HTML of a container to an icon accounting for compatibility.
 * @param {HTMLElement} container - The 
 * @param {string} iconName - The identifier of the icon in the 'ICONS' object.
 * @param {string} className - The HTML classes to be given to the icon.
 */
function setIcon(container, iconName, className) {

  // determine whether icon needs to be changed
  var iconUnchanged = (
    container.hasAttribute("data-icon") &&
    container.getAttribute("data-icon") == iconName
  );

  if (SVG_SUPPPORTED) {
    if (!iconUnchanged)
      container.innerHTML = ICONS.svg[iconName];
    container.firstChild.className.baseVal = "icon " + className;
  }
  else {
    // svg no supported
  }

  // set data attribute to determine if icon must be changed when run next time.
  container.setAttribute("data-icon", iconName);

}

/**
 * Makes a HTTP get API request for JSON data accounting for browser compatibility.
 * @param {string} baseUrl - The API url without a query string.
 * @param {Object.<string,string>} queries - A represention of the query string.
 * @returns {Promise<any>} Promise that resolves to the parsed JSON response.
 */
function apiRequest(baseUrl, queries) {

  if (XDOMAIN_XHR_SUPPORTED)
    return xhrAPIRequest(baseUrl, queries);
  else // fallback to insecure JSONP for older browser like Internet Explorer 9
    return jsonpAPIRequest(baseUrl, queries, REQUEST_TIMEOUT);

}

/**
 * Makes a XHR HTTP get API request for JSON data.
 * @param {string} baseUrl - The API url without a query string.
 * @param {Object.<string,string>} queries - A represention of the query string.
 * @returns {Promise<any>} Promise that resolves to the parsed JSON response.
 */
function xhrAPIRequest(baseUrl, queries) {

  queries.origin = "*"; // needed for CORS
  var url = baseUrl + encodeQuerystring(queries);

  return new Promise(function(resolve, reject) {

    var xhr = new XMLHttpRequest();
    xhr.open("get", url);

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) // if status indicates success
        resolve(JSON.parse(xhr.responseText));
      else
        reject(new Error(xhr.status + " " + xhr.statusText));
    };

    xhr.onerror = function (error) {
      reject(new Error("Unknown Error"));
    };

    xhr.send();

  });

}


/**
 * Makes a JSONP HTTP get API request for JSON data.
 * @param {string} baseUrl - The API url without a query string.
 * @param {Object.<string,string>} queries - A represention of the query string.
 * @returns {Promise<any>} Promise that resolves to the parsed JSON response.
 */
function jsonpAPIRequest(baseUrl, queries, timeout) {

  // generate the unqiue callback indentifier
  var callbackID = 'jsonpcallback' + (++jsonpRequestCount);

  // generate the request url
  queries.callback = callbackID;
  var url = baseUrl + encodeQuerystring(queries);

  return new Promise(function(resolve, reject) {

    var script;
    var timeoutID;

    function cleanup() {
      var scriptParent = script.parentNode;
      if (scriptParent)
        scriptParent.removeChild(script);
      clearTimeout(timeoutID);
      try {
        delete window[callbackID];
      }
      catch(error) {
        window[callbackID] = undefined;
      }
    }

    function handleResponse(data) {
      cleanup();
      resolve(data);
    }

    function handleTimeout() {
      cleanup();
      reject(new Error('Request Timed Out'));
    }

    window[callbackID] = handleResponse;

    if (timeout)
      timeoutID = setTimeout(handleTimeout, timeout);

    script = document.createElement('script');
    script.src = url;
    head.appendChild(script);

  });

}

/**
 * Returns greatest numeric value in an array.
 * @param {number[]} array - An array of numeric values.
 * @returns {number} The greatest numeric value. 
 */
function maxInArray(array) {
  
  if (array.length == 0)
    return undefined;

  var m = array[0];
  for (var i = 1; i < array.length; i++) {
    m = Math.max(array[i], m);
  }

  return m;

}

/**
 * Creates a promise that instantl resolves or rejects to a given value.
 * @param {*} value - The value to resolve or reject to.
 * @param {*} shouldReject - Whether the promise should resolve or reject
 * @returs {Promise<any>} The created promise.
 */
function instantPromise(value, shouldReject) {

  return new Promise(function(resolve, reject) {
    if (shouldReject)
      reject(value);
    else
      resolve(value);
  });

}



/* =========
    CLASSES
   ========= */

/**
 * Represents MediaWiki API connection to single hostname.
 * @constructor
 * @param {string} hostname - The hostname of the wiki (eg. en.wikipedia.org).
 */
function MediaWikiAPI(hostname) {

  this.hostname = hostname;
  this.url = "https://" + hostname + "/w/api.php";
  this.validated = false;
  this.server = undefined;

}

/**
 * Determines whether the api hostname belongs to a valid MediaWiki server.
 * @returns {Promise<undefined>} A promise the resolves if MediaWiki server is
 *   valid and rejects otherwise.
 */
MediaWikiAPI.prototype.validate = function() {

  var self = this; // preserving 'this' for callbacks

  // if already validated resolve instantly
  if (self.validated)
    return instantPromise();

  // query mediawiki server using the Siteinfo API
  // https://www.mediawiki.org/wiki/API:Siteinfo
  var siteInfoRequest = apiRequest(
    this.url,
    {
      format: "json",
      action: "query",
      meta: "siteinfo",
      siprop: "general"
    }
  );

  // handler for if api request fails
  // error.message == "Unknown Error" usually means there was a CORS issue. 
  function onError(error) {
    throw new Error(error.message + " from " + self.hostname);
  }

  // handler for succesful api request
  function onReponse(response) {

    // try to get generator info from the response (eg. "MediaWiki 1.35.0-wmf.1")
    var generator;
    try {
      generator = "" + response.query.general.generator;
    }
    catch(err) {
      throw new Error("Failed to validate " + self.hostname + " as MediaWiki server.");
    }

    // try to determine whether server meets 'MIN_MEDIAWIKI_VERSION'
    var meetsRequiredVersion;
    try {
      var versionString = generator.split(" ")[1].split("-")[0];
      meetsRequiredVersion = atLeastVersion(versionString, MIN_MEDIAWIKI_VERSION);
      self.server = "MediaWiki " + versionString;
    }
    catch (error) {
      throw new Error("Failed to confirm " + self.hostname + "'s MediaWiki version.");
    }

    if (meetsRequiredVersion)
      self.validated = true;
    else
      throw new Error(
        "MediaWiki server at " + self.hostname +
        " must be updated (" + versionString +
        " < " + MIN_MEDIAWIKI_VERSION + " REQUIRED)"
      );

  }

  return siteInfoRequest.then(onReponse, onError);

};

/**
 * Searches the MediaWiki server for articles using the opensearch API.
 * https://www.mediawiki.org/wiki/API:OpenSearch
 * @param {string} query - The search query results will be related to.
 * @param {number|string} limitParam - Max results, can be a number or "max".
 * @returns {Promise<string[]>} A promise that resolves to an array of titles.
 */
MediaWikiAPI.prototype.search = function(query, limitParam) {

  return apiRequest(
    this.url,
    {
      action: "opensearch",
      format: "json",
      redirects: "resolve",
      search: query,
      limit: limitParam,
      namespace: 0
    }
  ).then(function(response) {
    return response[1]; // return only the titles of received articles
  });

};

/**
 * Gets batches of random articles from the MediaWiki server using random API
 * https://www.mediawiki.org/wiki/API:Random
 * @param {number|string} limitParam - Max articles, can be a number or "max".
 * @param {string} continueParam - Optional param to continue a previous batch.
 * @returns {Promise<Object>} - A promise that reolves to an object with two
 *   properties: 'articles' and 'continueParam'. The 'articles' property
 *   contains an array of all the titles of the random articles. The 
 *   'continueParam' property is either null or a string which can be fed back
 *   into the corresponding argument to this function to continue a batch.
 */
MediaWikiAPI.prototype.getRandomArticles = function(limitParam, continueParam) {

  return apiRequest(
    this.url,
    {
      action: "query",
      format: "json",
      list: "random",
      rnlimit: limitParam,
      rnnamespace: 0,
      rncontinue: continueParam
    }
  ).then(function(response) {

    var result = {};

    // map all of the rceived page titles into a single array. 
    result.articles = response.query.random.map(function(page) {
      return page.title;
    });

    // determine whether the batch can be continued
    if ("continue" in response)
      result.continueParam = response["continue"].rncontinue;
    else
      result.continueParam = null;

    return result;
    
  });

}

/**
 * Gets pages that are linked by given articles using the MediaWiki links API.
 * https://www.mediawiki.org/wiki/API:Links
 * @param {string} titlesParam - 
 * @param {number|string} limitParam - 
 * @param {} continueParam - 
 */
MediaWikiAPI.prototype.getLinks = function(titlesParam, limitParam, continueParam) {

  return apiRequest(
    this.url,
    {
      action: 'query',
      format: 'json',
      prop: 'links',
      pllimit: limitParam,
      plnamespace: 0,
      plcontinue: continueParam,
      titles: titlesParam
    }
  ).then(this.createLinkHandler("links", "plcontinue"));

};

MediaWikiAPI.prototype.getBacklinks = function(titlesParam, limitParam, continueParam) {

  return apiRequest(
    this.url,
    {
      action: 'query',
      format: 'json',
      prop: 'linkshere',
      lhlimit: limitParam,
      lhprop: 'title',
      lhshow: '!redirect',
      lhnamespace: 0,
      lhcontinue: continueParam,
      titles: titlesParam
    }
  ).then(this.createLinkHandler("linkshere", "lhcontinue"));

};

MediaWikiAPI.prototype.createLinkHandler = function(linkProperty, continueProp) {

  return function(response) {

    var result = {};

    var parentPages = [];
    Object.keys(response.query.pages).forEach(function(key) {
      parentPages.push(response.query.pages[key]);
    });

    result.linkMap = {};
    parentPages.forEach(function(parentPage) {

      if (!(linkProperty in parentPage))
        return;
      var childPages = parentPage[linkProperty];
  
      result.linkMap[parentPage.title] = [];
      childPages.forEach(function(childPage) {
        result.linkMap[parentPage.title].push(childPage.title);
      });

      if ("continue" in response)
        result.continueParam = response["continue"][continueProp];
      else
        result.continueParam = undefined;
  
    });

    return result;

  };

};

MediaWikiAPI.prototype.buildArticleURL = function(article) {

  return "https://" + this.hostname + "/wiki/" + encodeURIComponent(article.replace(/ /g, "_"));

}

/** @constructor */
function RandomArticleFetcher() {

  this.articles = [];
  this.newArticlesPromise = undefined;
  this.continueParam = undefined;

}

RandomArticleFetcher.prototype.getArticles = function(count) {

  var self = this;

  if (self.newArticlesPromise !== undefined) {
    return self.newArticlesPromise.then(function() {
      return self.getArticles(count);
    });
  }

  if (self.articles.length >= count) {
    var temp = self.articles.slice(0, count);
    self.articles = self.articles.slice(count);
    return instantPromise(temp);
  }
  else if (self.articles.length > 0) {
    var temp = self.articles;
    self.articles = [];
    return self.getArticles(count - temp.length).then(function(newArticles) {
      return temp.concat(newArticles);
    });
  }

  self.newArticlesPromise = mediaWikiAPI.getRandomArticles("max", self.continueParam);

  return self.newArticlesPromise.then(function(result) {
      self.newArticlesPromise = undefined;
      self.continueParam = result.continueParam;
      self.articles = result.articles;
      return self.getArticles(count);
  });

};

RandomArticleFetcher.prototype.getArticle = function() {

  return this.getArticles(1).then(function(articles) {
    return articles[0];
  })

};

/** @constructor */
function LinkFetcher(direction) {

  var self;

  this.direction = direction;
  this.linkPromise = undefined;
  
  this.batchIndex = 0;
  this.lastBatchIndex = undefined;
  this.batches = [];

  this.undesirableBatchStack = [];

}

LinkFetcher.prototype.addArticles = function(articles) {

  while (articles.length != 0) {
    var batch = {};
    batch.articles = [];
    batch.titlesParam = "" + articles[0];
    var titleCount = Math.min(50, articles.length);
    var i;
    var encodedParamLength = encodeURIComponent(batch.titlesParam).length;
    for (i = 1; i < titleCount && encodedParamLength < 1500; i++) {
      batch.articles.push(articles[i]);
      batch.titlesParam += "|" + articles[i];
      encodedParamLength += encodeURIComponent("|" + articles[i]).length;
    };
    articles = articles.slice(i);
    batch.continueParam = undefined;
    this.batches.push(batch);
  }

};

LinkFetcher.prototype.fetch = function() {

  var self = this;

  if (self.complete())
    return instantPromise({});

  if (self.linkPromise)
    return self.linkPromise.then(function() {
      return self.fetch();
    });

  var currentBatch;
  if (self.batches.length > 0) {
    self.batchIndex = (self.batchIndex+1) % self.batches.length;
    currentBatch = self.batches[self.batchIndex];
  }
  else {
    currentBatch = self.undesirableBatchStack.pop();
    self.batches.push(currentBatch);
    self.batchIndex = 0;
  }

  if (self.direction == "forward")
    self.linkPromise = mediaWikiAPI.getLinks(currentBatch.titlesParam, "max", currentBatch.continueParam);
  else if (self.direction == "backward")
    self.linkPromise = mediaWikiAPI.getBacklinks(currentBatch.titlesParam, "max", currentBatch.continueParam);

  return self.linkPromise.then(function(response) {

    self.linkPromise = undefined;

    if (response.continueParam) {
      currentBatch.continueParam = response.continueParam;
      self.lastBatchIndex = self.batchIndex;
    }
    else {
      currentBatch.articles.forEach(function(article) {
        if (!(article in response.linkMap))
          response.linkMap[article] = [];
      });
      self.batches.splice(self.batchIndex, 1);
      self.lastBatchIndex = undefined;
    }

    return response.linkMap;

  });
};

LinkFetcher.prototype.markLastBatchUndesirable = function() {

  if (this.lastBatchIndex !== undefined) {

    var lastBatch = this.batches.splice(this.lastBatchIndex, 1)[0];
    this.undesirableBatchStack.push(lastBatch);
    this.lastBatchIndex = undefined;

  }

}

LinkFetcher.prototype.markAllBatchesUndesirable = function() {

  this.undesirableBatchStack = this.undesirableBatchStack.concat(this.batches);
  this.batches = [];
  this.lastBatchIndex = undefined;

}

LinkFetcher.prototype.complete = function() {

  return this.batches.length == 0 && this.undesirableBatchStack.length == 0;

};

LinkFetcher.prototype.noDesirableBatches = function() {

  return this.batches.length == 0;

};

/** @constructor */
function ArticleTree(rootPageTitle, direction)
{
  this.direction = direction;

  this.treeObj = {};
  this.treeObj[rootPageTitle] = "_root";

  this.fringe = {};
  this.fringe[rootPageTitle] = true;
  this.fringeSize = 1;

  this.depthMap = {};
  this.depthMap[rootPageTitle] = 0;

  this.linkFetcher = new LinkFetcher(direction);
  this.linkFetcher.addArticles([rootPageTitle]);

  this.toExplore = [];

  this.size = 1;

  this.layerSizes = [1];

  this.explorePromise = undefined;

  this.consecutiveUndesirableBatches = 0;
}

ArticleTree.prototype.explore = function()
{

  var self = this;

  if (self.explorePromise)
    return self.explorePromise.then(function() {
      return self.explore();
    });

  if (self.linkFetcher.noDesirableBatches()) {

    self.diversify();

    if (self.linkFetcher.complete())
      return instantPromise(new Error("Ran into a dead end while exloring article tree"), true);

  }

  self.explorePromise = self.linkFetcher.fetch();

  return self.explorePromise.then(function(response) {

    self.explorePromise = undefined;

    var newTitles = [];

    var parentTitles = Object.keys(response);
    parentTitles.forEach(function(parentTitle) {

      if (parentTitle in self.fringe) {
        delete self.fringe[parentTitle];
        self.fringeSize -= 1;
      }

      var childTitles = response[parentTitle];
      childTitles = childTitles.filter(function(childTitle) {
        return !self.containsPage(childTitle);
      });

      childTitles.forEach(function(childTitle) {

        var childDepth = self.depthMap[parentTitle] + 1;

        self.treeObj[childTitle] = parentTitle;
        self.fringe[childTitle] = true;
        self.depthMap[childTitle] = childDepth;
        self.toExplore.push(childTitle);
        newTitles.push(childTitle);

        while (self.layerSizes.length <= childDepth)
          self.layerSizes.push(0);

        self.layerSizes[childDepth] += 1;

      });

    });

    if (newTitles.length < 10) {
      self.linkFetcher.markLastBatchUndesirable();
      self.consecutiveUndesirableBatches += 1;

      if (self.consecutiveUndesirableBatches >= 4) {
        self.consecutiveUndesirableBatches = 0;
        self.linkFetcher.markAllBatchesUndesirable();
      }
    }
    else
      self.consecutiveUndesirableBatches = 0;

    self.size += newTitles.length;
    self.fringeSize += newTitles.length;

    return newTitles;

  });

};

ArticleTree.prototype.diversify = function() {

  console.log(this.direction + " injecting " + this.toExplore.length);
  this.linkFetcher.addArticles(this.toExplore);
  this.toExplore = [];

};

ArticleTree.prototype.pathToRoot = function(title) {

  if (!this.containsPage(title))
    throw new Error("title is not in the article tree.");

  var path = [];
  while (this.treeObj[title] != "_root") {
    title = this.treeObj[title];
    path.push(title);
  }
  return path;

}

ArticleTree.prototype.containsPage = function(title) {

  return title in this.treeObj;
  
};

/** @constructor */
function ArticleSelect(container, title) {

  var self = this;

  container.className = "articleselect";

  var header = document.createElement("div");
  header.className = "articleselect-header";
  
  var label = document.createElement("label");
  label.className = "articleselect-label";
  label.innerText = title;

  var suggestionsBox = document.createElement("div");
  suggestionsBox.className = "articleselect-suggestions";

  var searchBar = document.createElement("div");
  searchBar.className = "articleselect-searchbar";

  var inputWrapper = document.createElement("div");
  inputWrapper.className = "articleselect-inputwrapper";

  var input = document.createElement("input");
  input.className = "articleselect-input";
  input.placeholder = "Wiki Article Title";
  input.type = "text";
  function inputCallback() { self.inputChanged(); }
  input.oninput = inputCallback;
  if (input.attachEvent)
    input.attachEvent("onpropertychange", inputCallback);
  input.onfocus = function() { self.changeSuggestionVisibility("visible"); };
  input.onblur = function() { self.changeSuggestionVisibility("hidden"); };

  var randomizeButton = document.createElement("button");
  randomizeButton.setAttribute("type", "button");
  randomizeButton.className = "articleselect-randomize button";
  setIcon(randomizeButton, "dice", "articleselect-icon");
  randomizeButton.onclick = function() { self.randomize(); };

  var validityIndicator = document.createElement("button");
  validityIndicator.setAttribute("type", "button");
  validityIndicator.className = "articleselect-validity button";
  setIcon(validityIndicator, "x", "articleselect-icon");

  header.appendChild(label);
  header.appendChild(suggestionsBox);
  inputWrapper.appendChild(input);
  searchBar.appendChild(inputWrapper);
  searchBar.appendChild(randomizeButton);
  searchBar.appendChild(validityIndicator);
  container.appendChild(header);
  container.appendChild(searchBar);

  self.input = input;
  self.suggestionsBox = suggestionsBox;
  self.validityIndicator = validityIndicator;
  self.searchTimeout = undefined;
  self.suggestionTimeout = undefined;
  self.validatedTitle = undefined;
  self.waitingForRandom = false;

}

ArticleSelect.prototype.inputChanged = function () {

  var self = this;
  var inputString = self.input.value.trim();

  clearTimeout(self.searchTimeout);

  if (!inputString) {
    self.suggestionsBox.innerHTML = "";
    setIcon(self.validityIndicator, "x", "articleselect-icon");
    self.validatedTitle = undefined;
    return;
  }

  function handleSearchResults(results) {

    if (inputString != self.input.value.trim())
      return;

    if (results.length >= 1 && inputString.toLowerCase() == results[0].toLowerCase()) {
      setIcon(self.validityIndicator, "check", "articleselect-icon");
      self.validatedTitle = results[0];
    }
    else
      setIcon(self.validityIndicator, "x", "articleselect-icon");

    self.suggestionsBox.innerHTML = "";
    
    results.forEach(function(title) {
      if (title == inputString)
        return;
      self.addSuggestion(title);
    });

  }

  setIcon(self.validityIndicator, "sync", "articleselect-icon spin");
  self.validatedTitle = undefined;

  self.searchTimeout = setTimeout(function() {
    mediaWikiAPI.search(inputString, 10).then(
      handleSearchResults,
      function (error) {
        setIcon(self.validityIndicator, "x", "articleselect-icon");
        alert(error);
      }
    );
  }, 2*STANDARD_DELAY);

};

ArticleSelect.prototype.addSuggestion = function(title) {

  var self = this;

  function clickHandler() {
    self.input.value = title;
    self.validatedTitle = title;
    setIcon(self.validityIndicator, "check", "articleselect-icon");
    self.changeSuggestionVisibility("hidden");
  }

  var suggestionButton = document.createElement("button");
  suggestionButton.className = "button";
  suggestionButton.setAttribute("type", "button");
  suggestionButton.innerText = title;
  suggestionButton.onclick = clickHandler;

  this.suggestionsBox.appendChild(suggestionButton);

};

ArticleSelect.prototype.changeSuggestionVisibility = function(state) {

  var self = this;

  clearTimeout(self.suggestionTimeout);

  self.suggestionTimeout = setTimeout(function() {
    self.suggestionsBox.style.visibility = state;
  }, STANDARD_DELAY);

};

ArticleSelect.prototype.randomize = function() {

  var self = this;

  if (self.waitingForRandom)
    return;

  self.waitingForRandom = true;

  randomArticleFetcher.getArticle().then(function(title) {
    self.waitingForRandom = false;
    self.validatedTitle = title;
    self.input.value = title;
    setIcon(self.validityIndicator, "check", "articleselect-icon");
  });

};



/* =======================
    APPLICATION FUNCTIONS
   ======================= */

function autoWikipediaHostname() {

  var hostname = query.mw;

  function useDefault() {
    if (window.navigator.language) {
      var navLanguage = window.navigator.language.split('-')[0].toLowerCase();
      if (navLanguage in WIKIPEDIA_LANGUAGES)
        return navLanguage + ".wikipedia.org";
    }
    return "en.wikipedia.org"; // fall back to english wikipedia
  }

  if (!hostname)
    return useDefault();
  else if (VALID_HOSTNAME_REGEX.test(hostname))
    return hostname;
  else {
    alert("Specified mediawiki hostname is invalid! Reverting to default.")
    return useDefault();
  }

}

function setupAPI() {
  
  var mediaWikiHostname = autoWikipediaHostname();
  if (query.mw && mediaWikiHostname != query.mw)
    history.replaceState({}, "", "?mw=" + mediaWikiHostname);
  if (!mediaWikiAPI || mediaWikiAPI.hostname != mediaWikiHostname) {
    mediaWikiAPI = new MediaWikiAPI(mediaWikiHostname);
    randomArticleFetcher = new RandomArticleFetcher();
  }
  
  // create elements to inform user
  var apiInfo = document.createElement("p");
  var apiStatus = document.createElement("span");
  apiStatus.innerText = "Contacting " + mediaWikiAPI.hostname + " ...";
  apiInfo.className = "text-center text-muted";
  var apiChangeLink = createJSLink("change wiki", function() {
    history.pushState({}, "", "#wikiselect");
    resetPage();
  });

  function onValidate() {
    apiStatus.innerText = mediaWikiAPI.server + " - " + mediaWikiAPI.hostname;
  }

  function onError(error) {
    apiInfo.className = "text-center text-error";
    apiStatus.innerHTML = error.message + " ";
    var tryAgainLink = createJSLink("try again", resetPage);
    apiInfo.appendChild(document.createElement('br'));
    apiInfo.appendChild(tryAgainLink);
  }
  
  // add all elements to page
  apiInfo.appendChild(apiStatus);
  apiInfo.appendChild(document.createElement('br'));
  apiInfo.appendChild(apiChangeLink);
  content.appendChild(apiInfo);

  var validationPromise = mediaWikiAPI.validate();
  validationPromise.then(onValidate, onError);
  return validationPromise;
  
}

function setupLanguageSelect() {

  // create paragraph to contain the links
  var paragraph = document.createElement("p");
  paragraph.className = "text-center";

  // for each wikipedia lanuage create a link for it
  Object.keys(WIKIPEDIA_LANGUAGES).forEach(function(key) {

    // get info for language
    var mediaWikiDomain = key + ".wikipedia.org";
    var language = WIKIPEDIA_LANGUAGES[key];

    // create the link
    var link = createJSLink(language[0], function() {
      history.pushState({}, "", "?mw=" + mediaWikiDomain);
      resetPage();
    });
    link.className = "inline-block";
    link.title = language[1];

    // add the link to the pargraph along with a space after it
    paragraph.appendChild(link);
    paragraph.appendChild(document.createTextNode(" "));
  });

  content.appendChild(paragraph);

}

function setupForm() {

  var form  = document.createElement("form");

  var ArticleSelectDiv1 = document.createElement("div");
  var ArticleSelectDiv2 = document.createElement("div");
  var startArticleSelect = new ArticleSelect(ArticleSelectDiv1, "Start Article");
  var endArticleSelect = new ArticleSelect(ArticleSelectDiv2, "End Article");

  var submitButton = document.createElement("input");
  submitButton.className = "form-button";
  submitButton.type = "submit";
  submitButton.value = "Go";

  form.appendChild(ArticleSelectDiv1);
  form.appendChild(ArticleSelectDiv2);
  form.appendChild(submitButton);

  var howItWorksParagraph = document.createElement("p");
  howItWorksParagraph.className = "text-center";
  var howItWorksLink = document.createElement("a");
  howItWorksLink.target = "_blank";
  howItWorksLink.innerHTML = "how it works";
  howItWorksLink.href = "https://github.com/luctowers/wikimash/blob/master/readme.md#how-it-works";
  howItWorksParagraph.appendChild(howItWorksLink);

  var codeLinkParagraph = document.createElement("p");
  codeLinkParagraph.className = "text-center";
  var codeLink = document.createElement("a");
  codeLink.target = "_blank";
  codeLink.innerHTML = "code on github";
  codeLink.href = "https://github.com/luctowers/wikimash";
  codeLinkParagraph.appendChild(codeLink);

  content.appendChild(form);
  content.appendChild(howItWorksParagraph);
  content.appendChild(codeLinkParagraph);

  form.onsubmit = function() {

    var checkMarkInfo = "An article has been validated when there is check mark displayed beside it."

    if (!startArticleSelect.validatedTitle && !endArticleSelect.validatedTitle)
      alert("Both the start article and the end article have not been validated! " + checkMarkInfo);
    else if (startArticleSelect.validatedTitle == endArticleSelect.validatedTitle)
      alert("The start article and the end article must be different!");
    else if (!startArticleSelect.validatedTitle)
      alert("The start article has not been validated! " + checkMarkInfo);
    else if (!endArticleSelect.validatedTitle)
      alert("The end article has not been validated! " +  checkMarkInfo);
    else
      setupSolve(startArticleSelect.validatedTitle, endArticleSelect.validatedTitle);

    return false;

  }

}

function visualizeLayers(A, B, container, connect)
{
  container.innerHTML = "";

  var maxValue = maxInArray(A.concat(B));
  var totalLength = A.length + B.length;
  if (!connect)
    totalLength += 1;
  var rectWidth = 1 / totalLength;

  function chartValue(index, value) {
    var magnitude;
    if (value == 0)
      magnitude = 0;
    else
      magnitude = (Math.log(value) + 1.0) / (Math.log(maxValue) + 1.0);

    var rect = document.createElement("div");
    rect.style.position = "absolute";
    rect.style.left = index * rectWidth * 100 + '%';
    rect.style.top = (1 - magnitude) / 2 * 100 + '%';
    rect.style.width = rectWidth * 100 + 0.1 + '%';
    rect.style.height = magnitude * 100 + '%';
    rect.style.backgroundColor = "black";

    container.appendChild(rect);
  }

  for (var i = 0; i < A.length; i++)
    chartValue(i, A[i]);

  for (var i = 0; i < B.length; i++)
    chartValue(totalLength-i-1, B[i])
}

function setupSolve(start, end) {

  history.pushState({}, "", "#solving");

  content.innerHTML = "";

  var visualizerDiv = document.createElement("div");
  visualizerDiv.className = "visualizer";

  var articleCountParagraph = document.createElement("p");
  articleCountParagraph.className = "text-center";

  content.appendChild(visualizerDiv);
  content.appendChild(articleCountParagraph);

  function onCallback(forwardTree, backwardTree, solved) {

    visualizeLayers(forwardTree.layerSizes, backwardTree.layerSizes, visualizerDiv, solved);
    articleCountParagraph.innerText = forwardTree.size + backwardTree.size + " articles considered";

  }
  
  function onSolve(path) {

    history.replaceState({}, "", "#solved");
    
    path.forEach(function(article, index) {
      var link = document.createElement("a");
      link.className = "link-button";
      link.href = mediaWikiAPI.buildArticleURL(article);
      link.innerText = article;
      link.target = "_blank";
      content.appendChild(link);

      if (index == path.length-1)
        return;

      var iconContainer = document.createElement("div");
      iconContainer.className = "text-center";
      setIcon(iconContainer, "arrow");
      content.appendChild(iconContainer);
    });

    var copyPathParagraph = document.createElement("p");
    copyPathParagraph.className = "text-center";
    var pathText = path.join(" \u21D2 ");
    var textChangeTimeout;
    var copyPathLink = createJSLink("copy path as text", function() {

      if (copyStringToClipboard(pathText))
        copyPathLink.innerText = "copied to clipboard!";
      else
        copyPathLink.innerText = "failed to copy!";
      clearTimeout(textChangeTimeout);
      textChangeTimeout = setTimeout(function() {
        copyPathLink.innerText = "copy path as text";
      }, 4*STANDARD_DELAY);

    });
    copyPathParagraph.appendChild(copyPathLink);

    var tryAgainParagraph = document.createElement("p");
    tryAgainParagraph.className = "text-center";
    var tryAgainLink = createJSLink("try again", resetPage);
    tryAgainParagraph.appendChild(tryAgainLink);

    content.appendChild(copyPathParagraph);
    content.appendChild(tryAgainParagraph);

  }

  function onError(error) {

    console.log(error);

    var tryAgainParagraph = document.createElement("p");
    tryAgainParagraph.className = "text-center text-error";
    tryAgainParagraph.innerHTML = "No path was found!<br>";
    var tryAgainLink = createJSLink("try again", resetPage);
    tryAgainParagraph.appendChild(tryAgainLink);
    content.appendChild(tryAgainParagraph);

  }

  wikigameSolve(start, end, onCallback).then(onSolve, onError);

}

function wikigameSolve(start, end, progressCallback) {

  var forwardTree = new ArticleTree(start, "forward");
  var backwardTree = new ArticleTree(end, "backward");

  function algorithm() {

    progressCallback(forwardTree, backwardTree, false);

    var exploreTree;
    var compareTree;
    if (forwardTree.fringeSize <= backwardTree.fringeSize) {
      exploreTree = forwardTree;
      compareTree = backwardTree;
    }
    else {
      exploreTree = backwardTree;
      compareTree = forwardTree;
    }

    return exploreTree.explore().then(function(newArticles) {

      console.log(exploreTree.direction + " fringe size = " + exploreTree.fringeSize);

      var collision = undefined;
      var bestCollisionDistance = Number.MAX_VALUE;
      newArticles.forEach(function(newArticle) {
        if (compareTree.containsPage(newArticle)) {
          var collisionDistance = forwardTree.pathToRoot(newArticle).length + backwardTree.pathToRoot(newArticle).length;
          if (collisionDistance < bestCollisionDistance)
            collision = newArticle;
        }
      });

      if (collision)
        return collision;
      else
        return algorithm();

    });

  }

  return algorithm().then(function(collision) {

    progressCallback(forwardTree, backwardTree, true);

    var path = [collision];
    path = forwardTree.pathToRoot(collision).reverse().concat(path);
    path = path.concat(backwardTree.pathToRoot(collision));
    return path;

  });

}

function resetPage() {

  query = parseQueryString(window.location.search);

  // clear old content
  content.innerHTML = "";

  if (window.location.hash == "#wikiselect") {
    setupLanguageSelect();
    return;
  }
  else
    history.replaceState({}, "", "#");

  setupAPI().then(setupForm);

}


/* ===================
    START APPLICATION
   =================== */

window.onpopstate = function() { window.location.reload(); };
resetPage();



})(); // end of function closure
