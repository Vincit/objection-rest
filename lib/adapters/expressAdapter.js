module.exports = function (app, method, route, callback) {
  app[method.toLowerCase()](route, function (req, res, next) {
    try {
      callback({
        params: req.params,
        query: req.query,
        body: req.body
      }).then(function (result) {
        res.send(result);
      }).catch(next);
    } catch (err) {
      next(err);
    }
  });
};
