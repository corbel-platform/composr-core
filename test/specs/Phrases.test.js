var Phrases = require('../../src/lib/Phrases'),
  _ = require('lodash'),
  chai = require('chai'),
  sinon = require('sinon'),
  chaiAsPromised = require('chai-as-promised'),
  expect = chai.expect,
  should = chai.should();

chai.use(chaiAsPromised);

var phrasesFixtures = require('../fixtures/phrases');
var utilsPromises = require('../utils/promises');

describe('== Phrases ==', function() {

  describe('Phrases API', function() {
    it('exposes the expected methods', function() {
      expect(Phrases).to.respondTo('validate');
      expect(Phrases).to.respondTo('run');
      expect(Phrases).to.respondTo('get');
      expect(Phrases).to.respondTo('register');
      expect(Phrases).to.respondTo('_register');
      expect(Phrases).to.respondTo('_unregister');
      expect(Phrases).to.respondTo('compile');
      expect(Phrases).to.respondTo('_compile');
    });
  });

  describe('Phrases validation', function() {

    it('Validates correct models', function(done) {
      var goodPhraseModel = {
        url: 'test',
        get: {
          code: 'res.render(\'index\', {title: \'test\'});',
          doc: {}
        }
      };

      Phrases.validate(goodPhraseModel)
        .then(function(result) {
          expect(result).to.be.an('object');
          expect(result.valid).to.equals(true);
          done();
        })
        .catch(function(err) {
          console.log(err);
          done(err);
        });

    });

    it('Denies invalid models (Missing url and invalid doc field)', function(done) {
      var badPhraseModel = {
        url: '',
        get: {
          code: 'res.render(\'index\', {title: \'test\'});',
          doc: ''
        }
      };

      Phrases.validate(badPhraseModel)
        .then(function() {
          done('Error');
        })
        .catch(function(result) {
          expect(result).to.be.an('object');
          expect(result.valid).to.equals(false);
          expect(result.errors).to.be.an('array');
          expect(result.errors.length).to.equals(2);

          done();
        });

    });
  });

  describe('Compile phrases', function() {
    var stubEvents;

    beforeEach(function() {
      stubEvents = sinon.stub();

      Phrases.events = {
        emit: stubEvents
      };

    });


    it('should compile a well formed phrase', function() {
      var phrase = phrasesFixtures.correct[0];
      var result = Phrases.compile(phrase);

      expect(result).to.include.keys(
        'url',
        'regexpReference',
        'codes',
        'id'
      );

      expect(result.regexpReference).to.be.an('object');
      expect(result.codes).to.be.an('object');
      expect(result.regexpReference).to.include.keys(
        'params',
        'regexp'
      );
      expect(Object.keys(result.codes).length).to.be.above(0);

    });

    it('should generate a regular expression for the url', function() {
      var phrase = {
        url: 'test/:param/:optional?',
        get: {
          code: 'console.log(3);'
        }
      };

      var compiled = Phrases.compile(phrase);

      expect(compiled.regexpReference).to.be.defined;
      expect(compiled.regexpReference.regexp).to.be.defined;
    });

    it('should extract the pathparams for the url', function() {
      var phrase = {
        url: 'test/:param/:optional?',
        get: {
          code: 'console.log(3);'
        }
      };

      var compiled = Phrases.compile(phrase);

      expect(compiled.regexpReference).to.be.defined;
      expect(compiled.regexpReference.params.length).to.equals(2);
      expect(compiled.regexpReference.params[0]).to.equals('param');
      expect(compiled.regexpReference.params[1]).to.equals('optional?');
    });

    xit('should evaluate the function *only once* and mantain it in memory', function() {

    });

    it('should emit an event with information about the compilation', function() {
      var phrase = phrasesFixtures.correct[0];
      var result = Phrases.compile(phrase);

      expect(stubEvents.callCount).to.be.above(0);
      expect(stubEvents.calledWith('Phrases:compiled')).to.equals(true);
    });

    it('should allow passing a single phrase', function() {
      var compiled = Phrases.compile(phrasesFixtures.correct[0]);
      expect(Array.isArray(compiled)).to.equals(false);
    });

    it('should allow passing multiple phrases', function() {
      var compiledPhrases = Phrases.compile(phrasesFixtures.correct);
      expect(Array.isArray(compiledPhrases)).to.equals(true);
    });

  });

  describe('Reset phrases', function() {
    beforeEach(function() {
      Phrases.__phrases = {
        'testdomain': {
          'loginclient!:id': {},
          'loginclient2!:id': {},
          'loginclient3!:id': {}
        }
      };
    });

    afterEach(function() {
      Phrases.__phrases = {};
    });

    it('Has all the phrases initially', function() {
      expect(Object.keys(Phrases.__phrases).length).to.be.above(0);
    });

    it('Resets the phrases', function() {
      Phrases.resetPhrases();
      expect(Object.keys(Phrases.__phrases).length).to.equals(0);
    });

    //TODO: emit an event when reseting the phrases, for debug purposes.

  });

  describe('Get phrases', function() {

    beforeEach(function() {
      Phrases.__phrases = {
        'testdomain': {
          'loginclient!:id!:name': 'loginclient phrase',
          'user': 'user phrase'
        },
        'other:domain': {
          'test-endpoint-a': 'test endpoint',
          'register/user/:email': 'another endpoint'
        }
      }
    });

    afterEach(function() {
      Phrases.resetPhrases();
    });

    it('should return all the phrases if no domain is specified', function() {
      var phrasesObtained = Phrases.get();

      expect(phrasesObtained).to.include.keys(
        'testdomain',
        'other:domain'
      );

      expect(phrasesObtained.testdomain).to.include.keys(
        'loginclient!:id!:name',
        'user'
      );

      expect(phrasesObtained['other:domain']).to.include.keys(
        'test-endpoint-a',
        'register/user/:email'
      );

    });

    it('should return all the registered phrases for a domain if no id is passed', function() {
      var phrasesObtained = Phrases.get('other:domain');

      expect(phrasesObtained).to.include.keys(
        'test-endpoint-a',
        'register/user/:email'
      );
    });

    it('should not return phrases if the domain is wrong', function() {
      var phrasesObtained = Phrases.get('my-domain-not-existing');

      expect(phrasesObtained).to.be.a('null');
    });

    it('should return the specified phrase by id', function() {
      var phraseObtained = Phrases.get('other:domain', 'test-endpoint-a');

      expect(phraseObtained).to.equals('test endpoint');
    });

    it('should not return any phrase if id is wrong', function() {
      var phraseObtained = Phrases.get('other:domain', 'test-test-test');

      expect(phraseObtained).to.be.a('null');
    });

    it('should not return any phrase if domain is wrong and id is OK', function() {
      var phraseObtained = Phrases.get('other:domain:no:existing', 'test-endpoint-a');

      expect(phraseObtained).to.be.a('null');
    });

  });

  describe('Count phrases', function() {

    beforeEach(function() {
      Phrases.__phrases = {
        'testdomain': {
          'loginclient!:id!:name': 'loginclient phrase',
          'user': 'user phrase'
        },
        'other:domain': {
          'test-endpoint-a': 'test endpoint',
          'register/user/:email': 'another endpoint'
        }
      }
    });

    afterEach(function() {
      Phrases.resetPhrases();
    });

    it('Should count all the phrases', function() {
      expect(Phrases.count()).to.equals(4);
    });

  });

  describe('Add to list', function() {

    afterEach(function() {
      Phrases.resetPhrases();
    });

    it('Adds a phrase with a domain', function() {
      var added = Phrases._addToList('addtolist:domain', {
        id: 'serious-phrase',
        value: 'serious'
      });

      expect(Object.keys(Phrases.get('addtolist:domain')).length).to.equals(1);
      expect(Phrases.get('addtolist:domain', 'serious-phrase')).to.be.an('object');
      expect(Phrases.get('addtolist:domain', 'serious-phrase')).to.include.keys(
        'id',
        'value'
      );
      expect(added).to.equals(true);
    });

    it('Does not add an empty phrase', function() {
      var added = Phrases._addToList('addtolist:domain', null);

      expect(Phrases.get('addtolist:domain')).to.be.a('null');
      expect(added).to.equals(false);
    });

    it('Does not add non objects', function() {
      var added = Phrases._addToList('addtolist:domain', 'Hey');

      expect(Phrases.get('addtolist:domain')).to.be.a('null');
      expect(added).to.equals(false);
    });

    it('Does not add a phrase without id', function() {
      var added = Phrases._addToList('addtolist:domain', {});

      expect(Phrases.get('addtolist:domain')).to.be.a('null');
      expect(added).to.equals(false);
    });

  });

  describe('Phrases registration', function() {
    var stubEvents;

    beforeEach(function() {
      stubEvents = sinon.stub();
      //Mock the composr external methods
      Phrases.events = {
        emit: stubEvents
      };

      //Reset phrases for each test
      Phrases.resetPhrases();
    });

    it('should allow to register an array of phrase models', function(done) {
      var phrases = phrasesFixtures.correct;

      Phrases.register(phrases)
        .should.be.fulfilled
        .then(function(result) {
          expect(result).to.be.an('array');
          expect(result.length).to.equals(1);
        })
        .should.be.fulfilled.notify(done);
    });

    it('should allow to register a single phrase model', function(done) {
      var phrase = phrasesFixtures.correct[0];

      Phrases.register(phrase)
        .should.be.fulfilled.notify(done)
        .then(function(result) {
          expect(result).to.be.an('object');
        });
    });

    it('should emit a debug event when the phrase has been registered', function(done) {
      Phrases.register(phrasesFixtures.correct[0])
        .should.be.fulfilled
        .then(function() {
          expect(stubEvents.callCount).to.be.above(0);
          expect(stubEvents.calledWith('debug', 'phrase:registered')).to.equals(true);
        })
        .should.be.fulfilled.notify(done);
    });

    it('should return the registered state when it registers correctly', function(done) {
      var phrase = phrasesFixtures.correct[0];

      Phrases.register(phrase)
        .should.be.fulfilled
        .then(function(result) {
          expect(result).to.be.an('object');
          expect(result).to.include.keys(
            'registered',
            'id',
            'compiled',
            'error'
          );
          expect(result.id).to.equals(phrase.id);
          expect(result.registered).to.equals(true);
          expect(result.compiled).to.include.keys(
            'url',
            'regexpReference',
            'codes',
            'id'
          );
          expect(result.error).to.equals(null);
        })
        .should.be.fulfilled.notify(done);
    });

    it('should return the registered state when it does NOT register', function(done) {
      var phrase = phrasesFixtures.malformed[0];

      Phrases.register(phrase)
        .should.be.fulfilled
        .then(function(result) {
          expect(result).to.be.an('object');
          expect(result).to.include.keys(
            'registered',
            'id',
            'compiled',
            'error'
          );
          expect(result.id).to.equals(phrase.id);
          expect(result.registered).to.equals(false);
          expect(result.error).not.to.equals(null);
        })
        .should.be.fulfilled.notify(done);
    });

    it('should be returnable over the registered phrases', function(done) {
      var phrase = phrasesFixtures.correct[0];
      var phraseId = phrase.id;

      Phrases.register(phrase, 'mydomain')
        .should.be.fulfilled
        .then(function(result) {
          expect(result.registered).to.equals(true);

          var candidates = Phrases.get('mydomain');

          expect(Object.keys(candidates).length).to.equals(1);

          var sureCandidate = Phrases.get('mydomain', phraseId);

          expect(sureCandidate).to.include.keys(
            'url',
            'id',
            'regexpReference',
            'codes'
          );
          expect(sureCandidate.id).to.equals(phraseId);
        })
        .should.notify(done);
    });

    describe('Secure methods called', function() {
      var spyCompile, spyValidate, spy_compile, spyRegister, spyAddToList;

      beforeEach(function() {
        spyRegister = sinon.spy(Phrases, '_register');
        spyCompile = sinon.spy(Phrases, 'compile');
        spyValidate = sinon.spy(Phrases, 'validate');
        spy_compile = sinon.spy(Phrases, '_compile');
        spyAddToList = sinon.spy(Phrases, '_addToList');
      });

      afterEach(function() {
        spyRegister.restore();
        spyCompile.restore();
        spyValidate.restore();
        spy_compile.restore();
        spyAddToList.restore();
      });

      it('should call the compilation and validation methods when registering a phrase', function(done) {

        Phrases.register(phrasesFixtures.correct[0])
          .should.be.fulfilled
          .then(function() {
            expect(spyCompile.callCount).to.equals(1);
            expect(spy_compile.callCount).to.equals(1);
            expect(spyValidate.callCount).to.equals(1);
          })
          .should.be.fulfilled.notify(done);
      });

      it('should call the _register method with the domain', function(done) {

        Phrases.register(phrasesFixtures.correct[0], 'testingdomain:test')
          .should.be.fulfilled
          .then(function() {
            expect(spyRegister.callCount).to.equals(1);
            expect(spyRegister.calledWith(phrasesFixtures.correct[0], 'testingdomain:test')).to.equals(true);
          })
          .should.be.fulfilled.notify(done);
      });

      it('should call the _addToList method with the domain', function(done) {

        Phrases.register(phrasesFixtures.correct[0], 'testingdomain:test')
          .should.be.fulfilled
          .then(function() {
            expect(spyAddToList.callCount).to.equals(1);
            expect(spyAddToList.calledWith('testingdomain:test')).to.equals(true);
          })
          .should.be.fulfilled.notify(done);
      });

    });

    describe('Validation fail', function() {

      it('should emit an error when the registering fails because the validation fails', function(done) {
        Phrases.register(phrasesFixtures.malformed[0])
          .should.be.fulfilled
          .then(function() {
            expect(stubEvents.callCount).to.be.above(0);
            expect(stubEvents.calledWith('warn', 'phrase:not:registered')).to.equals(true);
          })
          .should.be.fulfilled.notify(done);
      });

      it('should return not registered when the registering fails because the validation fails', function(done) {
        Phrases.register(phrasesFixtures.malformed[0])
          .should.be.fulfilled
          .then(function(result) {
            expect(result.registered).to.equals(false);
          })
          .should.be.fulfilled.notify(done);
      });

    });

    describe('Compilation fail', function() {
      var stubCompile;

      beforeEach(function() {
        stubCompile = sinon.stub(Phrases, 'compile', function() {
          return false;
        });
      });

      afterEach(function() {
        stubCompile.restore();
      });

      it('should emit an error when the registering fails because the compilation fails', function(done) {
        Phrases.register(phrasesFixtures.correct[0])
          .then(function() {
            expect(stubEvents.callCount).to.be.above(0);
            expect(stubEvents.calledWith('warn', 'phrase:not:registered')).to.equals(true);
            done();
          });
      });

      it('should return the unregistered state when the compilation fails', function(done) {
        Phrases.register(phrasesFixtures.correct[0])
          .should.be.fulfilled
          .then(function(result) {
            expect(result.registered).to.equals(false);
          })
          .should.notify(done);
      });
    });

    describe('Domain registration', function() {
      var existingPhraseId = phrasesFixtures.correct[0].id;

      beforeEach(function(done) {
        Phrases.register(phrasesFixtures.correct, 'mydomain')
          .then(function(res) {
            done();
          });
      });

      afterEach(function() {
        Phrases.resetPhrases();
      });

      it('should not return any phrase from other domain', function() {
        console.log(Phrases.get());
        var phraseObtained = Phrases.get('other:domain', existingPhraseId);

        expect(phraseObtained).to.be.a('null');
      });

      it('should return the phrase from my domain', function() {
        var phraseObtained = Phrases.get('mydomain', existingPhraseId);

        expect(phraseObtained).to.include.keys(
          'url',
          'regexpReference',
          'codes',
          'id'
        );
      });
    });

  });

  xdescribe('Phrases unregistration', function() {
    beforeEach(function(done) {
      Phrases.register(phrasesFixtures.correct)
        .should.be.fulfilled.notify(done);
    });

    afterEach(function() {
      Phrases.resetPhrases();
    });

    it('should not remove an unregistered phrase', function() {
      Phrases.unregister(phrasesFixtures.correct[0].id)
    });

    it('should unregister a registered phrase', function() {

    });

    it('cannot request a unregistered phrase', function() {

    });

    it('should emit a debug event with info about the unregistration', function() {

    });

    it('should emit an event for the unregistration', function() {

    });

  });

  xdescribe('Phrases runner', function() {

    it('should not allow to run an unregistered phrase', function() {

    });

    it('should be able to register a phrase for running it', function() {

    });

    it('can execute a registered phrase', function() {

    });

  });

  describe('Domain extraction', function() {

    var testItems = [{
      id: 'booqs:demo!loginuser',
      value: 'booqs:demo'
    }, {
      id: 'test-client!myphrase!:parameter',
      value: 'test-client'
    }, {
      id: 'booqs:demo!bookWarehouseDetailMock!:id',
      value: 'booqs:demo'
    }];

    it('Extracts all the domains correctly', function() {
      testItems.forEach(function(phrase) {
        expect(Phrases._extractPhraseDomain(phrase)).to.equals(phrase.value);
      });
    });

  })


});