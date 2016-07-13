'use strict'
var phraseValidator = require('../validators/phrase.validator')
var PhraseModel = require('../models/PhraseModel')
var phraseDao = require('../daos/phraseDao')
var BaseManager = require('./base.manager')
var queryString = require('query-string')
var ComposrError = require('../ComposrError')
var MetricsFirer = require('../MetricsFirer')
var phrasesStore = require('../stores/phrases.store')
var parseToComposrError = require('../parseToComposrError')
var mockedServer = require('../mock')
var corbel = require('corbel-js')
var utils = require('../utils')

var _ = require('lodash')

var PhraseManager = function (options) {
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

PhraseManager.prototype.configure = function (config) {
  this.config = {
    urlBase: config.urlBase
  }
}

PhraseManager.prototype.__preAdd = function (domain, phraseModel) {
  var phrasesWithTheSamePath = this._filterByRegexp(domain, phraseModel.getRegexp())

  if (phrasesWithTheSamePath.length > 0) {
    this.events.emit('warn', 'phrase:path:duplicated', phraseModel.getId())
  }
}

PhraseManager.prototype._compile = function (domain, phrase) {
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
PhraseManager.prototype.runById = function (id, verb, params) {
  if (utils.values.isFalsy(verb)) {
    verb = 'get'
  }

  var phrase = this.getById(id)

  if (phrase && phrase.canRun(verb)) {
    var domain = this._extractDomainFromId(id)
    return this._run(phrase, verb, params, domain)
  } else {
    // @TODO: See if we want to return that error directly or a wrappedResponse with 404 status (or invalid VERB)
    return Promise.reject('phrase:cant:be:runned')
  }
}

// Executes a phrase matching a path
// TODO: add support for various versions at the same time
PhraseManager.prototype.runByPath = function (domain, path, verb, params, version) {
  if (utils.values.isFalsy(verb)) {
    verb = 'get'
  }

  var phrase = this.getByMatchingPath(domain, path, verb, version)
  // TODO: use version too , to get the correct version

  if (phrase) {
    if (!params) {
      params = {}
    }

    var queryParamsString = ''

    if (!params.query && !(params.req && params.req.query && Object.keys(params.req.query).length > 0)) {
      // If no reqQuery object or req.querty params are sent, extract them
      queryParamsString = path.indexOf('?') !== -1 ? path.substring(path.indexOf('?'), path.length) : ''
      params.query = queryString.parse(queryParamsString)
    }

    if (!params.params) {
      // extract params from path
      var sanitizedPath = path.replace(queryParamsString, '')
      params.params = phrase.extractParamsFromPath(sanitizedPath)
    }
    return this._run(phrase, verb, params, domain)
  } else {
    // @TODO: See if we want to return that error directly or a wrappedResponse with 404 status (or invalid VERB)
    return Promise.reject('phrase:cant:be:runned')
  }
}

/*
  Fills the sandbox with parameters
 */
function buildSandbox (sb, options, urlBase, domain, requirer, reqWrapper, resWrapper, nextWrapper, version) {
  sb.console = console
  sb.Promise = Promise

  sb.req = reqWrapper

  sb.res = resWrapper

  sb.next = nextWrapper.resolve

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

  sb.domain = domain

  sb.require = options.browser ? requirer.forDomain(domain, version, true) : requirer.forDomain(domain, version)

  sb.config = {}
  
  sb.config.urlBase = urlBase

  sb.metrics = new MetricsFirer(domain)
}

// Executes a phrase
PhraseManager.prototype._run = function (phrase, verb, params, domain) {
  this.events.emit('debug', 'running:phrase:' + phrase.getId() + ':' + verb)

  if (!params) {
    params = {}
  }

  var urlBase = params.config && params.config.urlBase ? params.config.urlBase : this.config.urlBase

  var resWrapper = mockedServer.res(params.server, params.res)
  var reqWrapper = mockedServer.req(params.server, params.req, params)
  var nextWrapper = mockedServer.next(params.next)
  var sandbox = {}

  // Fill the sandbox params
  buildSandbox(sandbox, params, urlBase, domain, this.requirer, reqWrapper, resWrapper, nextWrapper, phrase.getVersion())

  // trigger the execution
  try {
    if (params.browser) {
      phrase.__executeFunctionMode(verb, sandbox, params.timeout, params.file)
    } else {
      phrase.__executeScriptMode(verb, sandbox, params.timeout, params.file)
    }
  } catch (e) {
    // @TODO this errors can be:
    // - corbel errors
    // - Any thrown error in phrase
    // How do we handle it?
    if (params.browser) {
      // Function mode only throws an error when errored
      this.events.emit('warn', 'phrase:internal:error', e, phrase.getUrl())

      var error = parseToComposrError(e, 'error:phrase:exception:' + phrase.getUrl())

      resWrapper.status(error.status).send(error)
    } else {
      // vm throws an error when timedout
      this.events.emit('warn', 'phrase:timedout', e, phrase.getUrl())
      resWrapper.status(503).send(new ComposrError('error:phrase:timedout:' + phrase.getUrl(), 'The phrase endpoint is timing out', 503))
    }
  }

  // Resolve on any promise resolution or rejection, either res or next
  return Promise.race([resWrapper.promise, nextWrapper.promise])
}

// Returns a list of elements matching the same regexp
PhraseManager.prototype._filterByRegexp = function (domain, regexp) {
  var candidates = this.store.getAsList(domain)

  return _.filter(candidates, function (candidate) {
    return candidate.getRegexp() === regexp
  })
}

// Get all the phrases, or all the phrases for one domain
PhraseManager.prototype.getPhrases = function (domain) {
  return this.store.getAsList(domain)
}

/**
  CORE Entry point. One of the purposes of composr-core is to provide a fast and reliable
  getByMatchingPath method.
 **/
PhraseManager.prototype.getByMatchingPath = function (domain, path, verb, version) {
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
PhraseManager.prototype.count = function () {
  return this.store.getAsList().length
}

// TODO: Remove for using the MD5 check defined in BaseManager
PhraseManager.prototype.__shouldSave = function () {
  return true
}

module.exports = PhraseManager
