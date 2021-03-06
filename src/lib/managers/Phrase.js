'use strict'
var phraseValidator = require('../validators/phrase.validator')
var PhraseModel = require('../models/PhraseModel')
var phraseDao = require('../daos/phraseDao')
var BaseManager = require('./base.manager')
var queryString = require('query-string')
// var ComposrError = require('../ComposrError')
// var MetricsFirer = require('../MetricsFirer')
var phrasesStore = require('../stores/phrases.store')
// var parseToComposrError = require('../parseToComposrError')
var WrappedResponse = require('../mock').res
var WrappedRequest = require('../mock').req
var corbel = require('corbel-js')
var utils = require('../utils')

var _ = require('lodash')

var PhraseManager = function PhraseManager (options) {
  this.events = options.events
  this.requirer = options.requirer
  this.config = options.config || {}
}

PhraseManager.prototype = new BaseManager({
  itemName: 'phrase',
  store: phrasesStore,
  model: PhraseModel,
  dao: phraseDao,
  validator: phraseValidator
})

PhraseManager.prototype.configure = function configure (config) {
  this.config = {
    urlBase: config.urlBase
  }
}

PhraseManager.prototype.__preAdd = function __preAdd (domain, phraseModel) {
  var phrasesWithTheSamePath = this._filterByRegexp(domain, phraseModel.getRegexp())

  if (phrasesWithTheSamePath.length > 0) {
    this.events.emit('warn', 'phrase:path:duplicated', phraseModel.getId())
  }
}

PhraseManager.prototype._compile = function _compile (domain, phrase) {
  try {
    var PhraseModel = this.model
    var phraseInstance = new PhraseModel(phrase, domain)

    phraseInstance.compile(this.events)

    this.events.emit('debug', 'phrase:compiled', phraseInstance.getId(), Object.keys(phraseInstance.compiled.codes))

    return phraseInstance
  } catch (e) {
    // Somehow it has tried to compile an invalid phrase. Notify it and return false.
    // Catching errors and returning false here is important for not having an unstable phrases stack.
    this.events.emit('errore', 'phrase:not:usable', phrase.url, e)
    return false
  }
}

// Executes a phrase by id
PhraseManager.prototype.runById = function runById (id, verb, params, cb) {
  if (utils.values.isFalsy(verb)) {
    verb = 'get'
  }

  var parameters = getDefaultPhraseParams(params)

  var phrase = this.getById(id)

  if (phrase && phrase.canRun(verb)) {
    var domain = this._extractDomainFromId(id)
    this._run(phrase, verb, parameters, domain, cb)
  } else {
    // @TODO: See if we want to return that error directly or a wrappedResponse with 404 status (or invalid VERB)
    cb('phrase:cant:be:runned')
  }
}

// Executes a phrase matching a path
PhraseManager.prototype.runByPath = function runByPath (domain, path, verb, params, version, cb) {
  if (utils.values.isFalsy(verb)) {
    verb = 'get'
  }

  var phrase = this.getByMatchingPath(domain, path, verb, version)

  if (phrase) {
    var parameters = getDefaultPhraseParams(params)

    var queryParamsString = path.indexOf('?') !== -1 ? path.substring(path.indexOf('?'), path.length) : ''

    if (!parameters.query && !(parameters.req && parameters.req.query && Object.keys(parameters.req.query).length > 0)) {
      // If no reqQuery object or req.querty params are sent, extract them
      parameters.query = queryString.parse(queryParamsString)
    }

    if (!parameters.params) {
      // extract params from path
      var sanitizedPath = path.replace(queryParamsString, '')
      parameters.params = phrase.extractParamsFromPath(sanitizedPath)
    }
    this._run(phrase, verb, parameters, domain, cb)
  } else {
    cb('phrase:cant:be:runned')
  }
}

function getDefaultPhraseParams (options) {
  var defaultParameters = {
    functionMode: true,
    query: null,
    params: null,
    headers: null,
    corbelDriver: null,
    domain: null,
    timeout: null,
    body: null
  }

  return Object.assign({}, defaultParameters, options)
}

/*
  Fills the sandbox with parameters
 */
/* function buildSandbox (options, urlBase, domain, requirer, reqWrapper, resWrapper, version) {
  // The object that will be inject on the phrase itself.
  var sb = {
    req: reqWrapper,
    res: resWrapper,
    // next: nextWrapper.resolve,
    domain: domain,
    config: {
      urlBase: urlBase
    },
    // metrics: new MetricsFirer(domain)
    metrics: null
  }

  // sb.require = options.functionMode ? requirer.forDomain(domain, version, true) : requirer.forDomain(domain, version)
  // sb.require = requirer(domain, version, options.functionMode)

  if (!options.corbelDriver && reqWrapper.get('Authorization')) {
    sb.corbelDriver = corbel.getDriver({
      urlBase: urlBase,
      iamToken: {
        accessToken: reqWrapper.get('Authorization')
      },
      domain: domain
    })
  } else {
    sb.corbelDriver = options.corbelDriver
  }

  return sb
}*/

PhraseManager.prototype._run = function _runPhrase (phrase, verb, params, domain, cb) {
  this.events.emit('debug', 'running:phrase:' + phrase.getId() + ':' + verb)

  var urlBase = params.config && params.config.urlBase ? params.config.urlBase : this.config.urlBase

  var resWrapper = new WrappedResponse(params.res)
  var reqWrapper = new WrappedRequest(params.req, params)

  // Fill the sandbox params
  var sandbox = {
    req: reqWrapper,
    res: resWrapper,
    // next: params.next,
    require: this.requirer(domain, phrase.getVersion(), params.functionMode),
    domain: domain,
    config: {
      urlBase: urlBase
    }
  }

  if (!params.corbelDriver && reqWrapper.get('Authorization')) {
    sandbox.corbelDriver = corbel.getDriver({
      urlBase: urlBase,
      iamToken: {
        accessToken: reqWrapper.get('Authorization')
      },
      domain: domain
    })
  } else {
    sandbox.corbelDriver = params.corbelDriver
  }

  sandbox.res.on('end', function (resp) {
    cb(null, resp)
  })

  // Execute the phrase
  if (params.functionMode) {
    phrase.__executeFunctionMode(verb, sandbox, params.timeout, params.file)
  } else {
    phrase.__executeScriptMode(verb, sandbox, params.timeout, params.file, this.events)
  /* try {
  } catch (e) {
    // console.log(e)
    // @TODO this errors can be:
    // - corbel errors
    // - Any thrown error in phrase
    // How do we handle it?
    if (params.functionMode) {
      // Function mode only throws an error when errored
      this.events.emit('warn', 'phrase:internal:error', e, phrase.getUrl())

      var error = parseToComposrError(e, 'error:phrase:exception:' + phrase.getUrl())

      sandbox.res.send(error.status, error)
    } else {
      // vm throws an error when timedout
    }
  }*/
  }
}

// Returns a list of elements matching the same regexp
PhraseManager.prototype._filterByRegexp = function _filterByRegexp (domain, regexp) {
  var candidates = this.store.getAsList(domain)

  return _.filter(candidates, function (candidate) {
    return candidate.getRegexp() === regexp
  })
}

// Get all the phrases, or all the phrases for one domain
PhraseManager.prototype.getPhrases = function getPhrases (domain) {
  return this.store.getAsList(domain)
}

/**
  CORE Entry point. One of the purposes of composr-core is to provide a fast and reliable
  getByMatchingPath method.
 **/
PhraseManager.prototype.getByMatchingPath = function getByMatchingPath (domain, path, verb, version) {
  var candidate = null

  if (!verb) {
    verb = 'get'
  }

  domain = utils.values.isFalsy(domain) ? null : domain

  this.events.emit('debug', 'phrase:getByMatchingPath:' + domain + ':' + path + ':' + verb)

  if (utils.values.isFalsy(path)) {
    this.events.emit('error', 'phrase:getByMatchingPath:path:undefined')
    return candidate
  }

  var queryParamsString = path.indexOf('?') !== -1 ? path.substring(path.indexOf('?'), path.length) : ''

  path = path.replace(queryParamsString, '')

  if (domain === null) {
    this.events.emit('warn', 'phrase:getByMatchingPath:noDomain:matchingAgainstAll:expensiveMethod')
  }

  var candidates = this.store.getAsList(domain)

  this.events.emit('debug', 'evaluating:' + candidates.length + ':candidates')

  candidates = _.compact(candidates.map(function (phrase) {
    if (phrase.canRun(verb) && phrase.matchesPath(path)) {
      if (!version || (version && phrase.getVersion() === version)) {
        return phrase
      }
    }
  }))

  this.events.emit('debug', 'found:' + candidates.length + ':candidates')

  if (candidates.length === 0) {
    this.events.emit('debug', 'notfound:candidates:path:' + path + ':' + verb)
    return candidate
  } else {
    candidate = candidates[0]
    this.events.emit('debug', 'using:candidate:' + candidate.getId() + ':' + verb)
    return candidate
  }
}

// Counts all the loaded phrases
PhraseManager.prototype.count = function count () {
  return this.store.getAsList().length
}

// TODO: Remove for using the MD5 check defined in BaseManager
PhraseManager.prototype.__shouldSave = function __shouldSave () {
  return true
}

module.exports = PhraseManager
