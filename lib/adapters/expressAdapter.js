'use strict';

var Promise = require('bluebird');

module.exports = function expressAdapter(app, method, route, callback) {
  // Express app has a routing method for each HTTP verb. Call the correct
  // routing method and pass the route as a parameter.
  app[method.toLowerCase()](route, function (req, res, next) {
    Promise.try(function () {
      // objection-rest only needs the `params`, `query` and `body` attributes of
      // the express request.
      return callback({params: req.params, query: req.query, body: req.body});
    }).then(function (result) {
      res.send(result);
    }).catch(next);
  });
};
