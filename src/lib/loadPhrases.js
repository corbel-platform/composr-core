'use strict';

var loadPhrases = function loadPhrases(){
  var that = this;
  var caller = function(pageNumber, pageSize) {
    return that.corbelDriver.resources.collection(that.resources.phrasesCollection).get({
      pagination: {
        page: pageNumber,
        size: pageSize
      }
    });
  };

  return this.utils.getAllRecursively(caller);
};

module.exports = loadPhrases;