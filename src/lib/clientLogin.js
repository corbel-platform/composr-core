'use strict';

var q = require('q');

function clientLogin() {
  /*jshint validthis:true */
  var module = this;
  var dfd = q.defer();

  if (!this.corbelDriver) {
    module.events.emit('error', 'error:missing:corbelDriver');
    return Promise.reject('error:missing:corbelDriver');
  }

  this.corbelDriver.iam.token().create()
    .then(function(response) {
      if (response.data && response.data.accessToken) {
        module.events.emit('debug', 'login:successful');
        dfd.resolve(response.data.accessToken);
      } else {
        //This point can be reached if the urlBase of the driver points to another service that returns something.
        module.events.emit('error', 'login:invalid:response');
        dfd.reject('login:invalid:response');
      }
    })
    .catch(function(err) {
      //Invalid credentials, 401, 404
      var error = err && err.data && err.data.body ? err.data.body : err;
      module.events.emit('error', 'login:invalid:credentials', err.status, error);
      dfd.reject(error);
    });

  return dfd.promise;
}

module.exports = clientLogin;