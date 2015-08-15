var RestApiGenerator = require('./lib/RestApiGenerator');

module.exports = function (objection) {
  return new RestApiGenerator(objection);
};

module.exports.RestApiGenerator = RestApiGenerator;
