
'use strict';

function CompoSR(){
  this.config = null;

  //Corbel collections  
  this.resources = {
    phrasesCollection: 'composr:Phrase',
    snippetsCollection: 'composr:Snippets'
  };

  //Loaded resources
  this.data = {
    phrases: null,
    snippets: null
  };

  this.corbelDriver = null;
}

CompoSR.prototype.init = require('./lib/init');
CompoSR.prototype.initCorbelDriver = require('./lib/initCorbelDriver');
CompoSR.prototype.logClient = require('./lib/logClient');
CompoSR.prototype.bindConfiguration = require('./lib/bindConfiguration');
CompoSR.prototype.loadPhrases = require('./lib/loadPhrases');
CompoSR.prototype.loadSnippets = require('./lib/loadSnippets');
CompoSR.prototype.fetchData = require('./lib/fetchData');
CompoSR.prototype.registerData = require('./lib/registerData');
CompoSR.prototype.events = require('./lib/events');
CompoSR.prototype.utils = require('./lib/utils');
CompoSR.prototype.Phrases = require('./lib/Phrases');
CompoSR.prototype.Snippets = require('./lib/Snippets');
CompoSR.prototype._logger = require('./lib/logger');

module.exports = new CompoSR();