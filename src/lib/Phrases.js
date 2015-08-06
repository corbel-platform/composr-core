'use strict';
var phraseValidator = require('./validators/phrase.validator.js');
var regexpGenerator = require('./regexpGenerator');
var q = require('q');

var DEFAULT_PHRASE_PARAMETERS = ['req', 'res', 'next', 'corbelDriver', 'corbel', 'ComposrError', 'domain', '_', 'q', 'request', 'compoSR'];

var Phrases = {
  prototype: {
    __phrases: {},

    resetPhrases: function() {
      this.__phrases = {};
    },

    //Register accepts either a single object or an array
    register: function(phraseOrPhrases, phrasesDomain) {
      var dfd = q.defer();

      var module = this;

      var isArray = Array.isArray(phraseOrPhrases);

      if (isArray === false) {
        phraseOrPhrases = [phraseOrPhrases];
      }

      var promises = phraseOrPhrases.map(function(phrase) {
        return module._register(phrase, phrasesDomain);
      });

      //TODO: think if reject the promise or not. 
      //For a bunch of phrases it's better to not fail and register the ones that are OK, but for one phrase maybe it has sense to fail
      //but 2 different behaviours aren't good. 
      // - Maybe allways resolve the registration and include in the resolution how many have been registered?
      // - Or not register anyone if some one fails? Thats a bit dangerous though
      q.allSettled(promises)
        .then(function(results) {

          //result has => value === resolved/ state === 'fulfilled' / reason === error
          results = results.map(function(result, index) {
            var returnedInfo = {
              registered: result.state === 'fulfilled',
              id: phraseOrPhrases[index].id,
              compiled: result.state === 'fulfilled' ? result.value : null,
              error: result.reason ? result.reason : null
            };

            return returnedInfo;
          });

          if (isArray) {
            dfd.resolve(results);
          } else {
            dfd.resolve(results[0]);
          }
        });

      return dfd.promise;
    },

    //Stores the phrases in memory on a list by domain
    _register: function(phrase, phrasesDomain) {
      var dfd = q.defer();

      var module = this;

      this.validate(phrase)
        .then(function() {
          var phraseDomain = phrasesDomain ? phrasesDomain : module._extractPhraseDomain(phrase);

          var compiled = module.compile(phrase);

          if (compiled) {
            module._addToList(phraseDomain, compiled);
            module.events.emit('debug', 'phrase:registered', phrase.id);
            dfd.resolve(compiled);
          } else {
            module.events.emit('warn', 'phrase:not:registered', phrase.id);
            dfd.reject();
          }

        })
        .catch(function(err) {
          module.events.emit('warn', 'phrase:not:registered', 'phrase:not:valid', phrase.id, err);
          dfd.reject(err);
        });

      return dfd.promise;
    },

    //Modifies the internal __phrases list
    _addToList: function(phraseDomain, phraseCompiled) {
      if (!phraseDomain || !phraseCompiled) {
        return false;
      }

      if (typeof(phraseCompiled) !== 'object' || phraseCompiled.hasOwnProperty('id') === false || !phraseCompiled.id) {
        return false;
      }

      this.__phrases[phraseDomain] = this.__phrases[phraseDomain] || {};
      this.__phrases[phraseDomain][phraseCompiled.id] = phraseCompiled;

      return true;
    },

    //Removes phrases from memory
    _unregister: function() {

    },

    //Generates the regular expressions for the phrases endpoints
    compile: function(phraseOrPhrases) {

      var module = this;

      var isArray = Array.isArray(phraseOrPhrases);

      if (isArray === false) {
        phraseOrPhrases = [phraseOrPhrases];
      }

      var compiledResults = phraseOrPhrases.map(function(phrase) {
        return module._compile(phrase);
      });

      return isArray ? compiledResults : compiledResults[0];

    },

    _compile: function(phrase) {
      try {
        var module = this;

        var compiled = {};

        compiled.url = phrase.url;
        compiled.id = phrase.id || phrase.url;

        //The regexp reference dictaminates the routing mechanisms
        compiled.regexpReference = regexpGenerator.regexpReference(phrase.url);

        var methods = ['get', 'put', 'post', 'delete', 'options'];

        compiled.codes = {};

        //Create in memory functions with the evaluation of the codes
        methods.forEach(function(method) {
          if (phrase[method] && (phrase[method].code || phrase[method].codehash)) {
            module.events.emit('debug', 'phrase_manager:evaluatecode:', method, phrase.id);

            var code = phrase[method].code ? phrase[method].code : new Buffer(phrase[method].codehash, 'base64').toString('utf8');
            compiled.codes[method] = module._evaluateCode(code);
          }
        });

        module.events.emit('Phrases:compiled', compiled);

        return compiled;

      } catch (e) {
        //Somehow it has tried to compile an invalid phrase. Notify it and return false.
        //Catching errors and returning false here is important for not having an unstable phrases stack.
        this.events.emit('error', 'phrase:not:usable', phrase.url, e);
        return false;
      }

    },

    //Creates a function based on a function body and some params.
    _evaluateCode: function(functionBody, params) {
      var phraseParams = params ? params : DEFAULT_PHRASE_PARAMETERS;
      var result = {
        fn: null,
        error: false
      };

      try {
        /* jshint evil:true */
        result.fn = Function.apply(null, phraseParams.concat(functionBody));
      } catch (e) {
        this.events.emit('warn', 'phrase_manager:evaluatecode:wrong_code', e);
        result.error = true;
      }

      return result;
    },

    //Verifies that a JSON for a phrase is well formed
    validate: function(phrase) {
      var dfd = q.defer();
      phraseValidator(phrase)
        .then(function() {
          dfd.resolve({
            valid: true
          });
        })
        .catch(function(errors) {
          dfd.reject({
            valid: false,
            errors: errors
          });
        });
      return dfd.promise;
    },

    //Executes a phrase
    run: function() {

    },

    //Returns one or all the phrases
    get: function(domain, id) {
      if (!domain) {
        return this.__phrases;
      }

      if (domain && !id) {
        return this.__phrases[domain] ? this.__phrases[domain] : null;
      }

      if (domain && id) {
        var domainPhrases = this.__phrases[domain] ? this.__phrases[domain] : null;

        return domainPhrases && domainPhrases[id] ? domainPhrases[id] : null;
      }
    },

    //Counts all the loaded phrases
    count: function() {
      var module = this;
      var count = Object.keys(this.__phrases).reduce(function(prev, next) {
        return prev + Object.keys(module.__phrases[next]).length;
      }, 0);
      return count;
    },

    //Extracts the domain from a phrase
    _extractPhraseDomain: function(phrase) {
      return phrase.id.split('!')[0];
    }
  },
  create: function(options) {
    // do stuff with options
    return Object.create(Phrases.prototype, options);
  }
};

module.exports = Phrases.create();