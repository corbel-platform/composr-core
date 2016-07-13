'use strict'

var _ = require('lodash')
var BaseModel = require('./BaseModel')
var regexpGenerator = require('../regexpGenerator')
var paramsExtractor = require('../paramsExtractor')
var XRegExp = require('xregexp')
var utils = require('../utils.js')
var evaluateCode = require('../compilers/evaluateCode')
var methods = ['get', 'put', 'post', 'delete', 'options']
var ComposrError = require('../ComposrError')
var DEFAULT_PHRASE_PARAMETERS = [
  'req',
  'res',
  'next',
  'corbelDriver',
  'domain',
  'require',
  'config',
  'metrics'
]

var PhraseModel = function (json, domain) {
  this.json = _.cloneDeep(json) // Clone to avoid modifications on parent object
  this.id = this._generateId(domain)
  this.domain = domain

  // Stores the id on the raw model
  this.json.id = this.id

  // The regexp reference dictaminates the routing mechanisms
  this.regexpReference = regexpGenerator.regexpReference(this.getUrl())

  this.compiled = {
    codes: {}
  }
}

PhraseModel.prototype = new BaseModel()

PhraseModel.prototype.getUrl = function () {
  return this.json.url
}

PhraseModel.prototype.getName = function () {
  return this.getUrl().replace(/\//g, '!')
}

PhraseModel.prototype.getRegexp = function () {
  return this.getRegexpReference().regexp
}

PhraseModel.prototype.getRegexpReference = function () {
  return this.regexpReference
}

PhraseModel.prototype.getMiddlewares = function (verb) {
  if (verb && this.json[verb] && this.json[verb].middlewares && Array.isArray(this.json[verb].middlewares)) {
    return this.json[verb].middlewares
  } else {
    return []
  }
}

PhraseModel.prototype.getDoc = function (verb) {
  if (verb && this.json[verb] && this.json[verb].doc) {
    return this.json[verb].doc
  } else {
    return null
  }
}

PhraseModel.prototype.canRun = function (verb) {
  return (this.compiled.codes[verb] && this.compiled.codes[verb].error === false) || false
}

PhraseModel.prototype.matchesPath = function (path) {
  return XRegExp.test(path, this.getRegexpReference().xregexp)
}

/*
 Asume that the path is sanitized without query params.
 */
PhraseModel.prototype.extractParamsFromPath = function (path) {
  return paramsExtractor.extract(path, this.getRegexpReference())
}

PhraseModel.prototype.compile = function (events) {
  var model = this

  this.compiled.codes = {}

  // Create in memory functions with the evaluation of the codes
  methods.forEach(function (method) {
    if (model.json[method] && (model.json[method].code || model.json[method].codehash)) {
      // @TODO: emit events for the evaluation of the codes
      //
      if (events) {
        events.emit('debug', 'phrase:evaluatecode:', method, model.getId())
      }

      var code

      if (model.json[method].codehash) {
        code = utils.decodeFromBase64(model.json[method].codehash)
      } else {
        code = model.json[method].code
      }

      var debugInfo = model.json.debug ? model.json.debug[method] : null

      var codeCompiled = evaluateCode(code, DEFAULT_PHRASE_PARAMETERS, debugInfo)

      if (events) {
        if (codeCompiled.error) {
          events.emit('warn', model.getId() + ':evaluatecode:wrong_code', codeCompiled.error)
        } else {
          events.emit('debug', model.getId() + ':evaluatecode:good')
        }
      }

      model.compiled.codes[method] = codeCompiled
    }
  })
}

// Runs VM script mode
PhraseModel.prototype.__executeScriptMode = function (verb, parameters, timeout, file) {
  var options = {
    timeout: timeout || 10000,
    displayErrors: true
  }

  if (file) {
    options.filename = file
  }

  this.compiled.codes[verb].script.runInNewContext(parameters, options)
}

// Runs function mode (DEPRECATED)
PhraseModel.prototype.__executeFunctionMode = function (verb, parameters, timeout, file) {
  // @TODO: configure timeout
  // @TODO: enable VM if memory bug gets solved
  var url = this.getUrl()

  setTimeout(function () {
    if (parameters.res.hasEnded() === false) {
      parameters.res.status(503).send(new ComposrError('error:phrase:timedout:' + url, 'The phrase endpoint is timing out', 503))
    }
  }, timeout || 10000)

  if (file) {
    var fn = require(file)
    fn(
      parameters.req,
      parameters.res,
      parameters.next,
      parameters.corbelDriver,
      parameters.domain,
      parameters.require,
      parameters.config,
<<<<<<< HEAD
      parameters.metrics,
      parameters.userId
    );
=======
      parameters.metrics
    )
>>>>>>> github/master
  } else {
    this.compiled.codes[verb].fn.apply(null, [parameters.req,
      parameters.res,
      parameters.next,
      parameters.corbelDriver,
      parameters.domain,
      parameters.require,
      parameters.config,
<<<<<<< HEAD
      parameters.metrics,
      parameters.userId
    ]);
=======
      parameters.metrics
    ])
>>>>>>> github/master
  }
}

module.exports = PhraseModel
