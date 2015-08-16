'use strict';

var Promise = require('bluebird');

module.exports = function (app, method, route, callback) {
  app[method.toLowerCase()](route, function (req, res, next) {
    Promise.try(function () {
      return callback({
        params: req.params,
        query: req.query,
        body: req.body
      });
    }).then(function (result) {
      res.send(result);
    }).catch(next);
  });
};
