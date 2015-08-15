var _ = require('lodash');
var findQuery = require('objection-find');
var expressAdapter = require('./adapters/expressAdapter');

/**
 * POST /persons
 *
 * GET /persons
 * GET /persons/:id
 * GET /persons/:id/parent
 * GET /persons/:id/children
 * GET /persons/:id/movies
 *
 * PUT /persons/:id
 * PUT /persons/:id/children
 * PUT /persons/:id/movies
 *
 * PATCH /persons/:id
 *
 * DELETE /persons/:id
 * DELETE /persons/:id/children
 * DELETE /persons/:id/movies
 *
 * restApiGenerator()
 *   .addModel(Person)
 *   .addModel(Movie)
 *   .exclude('PUT', '/api/v1/persons')
 */

function RestApiGenerator(objection) {
  this._objection = objection;
  this._logger = _.noop;
  this._models = Object.create(null);
  this._findQueries = Object.create(null);
  this._routePrefix = '/';
  this._exclude = [];
  this._databaseGetter = null;
  this._adapter = expressAdapter;
  this._pluralizer = function (word) {
    return word + 's';
  };
}

RestApiGenerator.prototype.logger = function (logger) {
  this._logger = logger;
  return this;
};

RestApiGenerator.prototype.addModel = function (modelClass, modifyCb) {
  var self = this;

  this._models[modelClass.tableName] = modelClass;
  this._findQueries[modelClass.tableName] = findQuery(modelClass);

  if (modifyCb) {
   modifyCb(this._findQueries[modelClass.tableName]);
  }

  _.each(modelClass.getRelations(), function (relation) {
    if (!self._findQueries[relation.relatedModelClass.tableName]) {
      self._findQueries[relation.relatedModelClass.tableName] = findQuery(relation.relatedModelClass);
    }
  });

  return this;
};

RestApiGenerator.prototype.routePrefix = function (routePrefix) {
  if (_.last(routePrefix) !== '/') {
    this._routePrefix = routePrefix + '/';
  } else {
    this._routePrefix = routePrefix;
  }
  return this;
};

RestApiGenerator.prototype.pluralizer = function (pluralizer) {
  this._pluralizer = pluralizer;
  return this;
};

RestApiGenerator.prototype.exclude = function (method, exclude) {
  this._exclude.push({
    method: method,
    exclude: exclude
  });
  return this;
};

RestApiGenerator.prototype.databaseGetter = function (databaseGetter) {
  this._databaseGetter = databaseGetter;
  return this;
};

RestApiGenerator.prototype.adapter = function (adapter) {
  this._adapter = adapter;
  return this;
};


RestApiGenerator.prototype.generate = function (app) {
  var self = this;

  _.each(this._models, function (modelClass) {
    var route = self._routeForModel(modelClass);

    if (!self._isExcluded('POST', route)) {
      self._generatePost(app, modelClass);
    }

    if (!self._isExcluded('GET', route)) {
      self._generateGetAll(app, modelClass);
    }

    if (!self._isExcluded('GET', route + '/:id')) {
      self._generateGet(app, modelClass);
    }

    if (!self._isExcluded('PUT', route + '/:id')) {
      self._generatePut(app, modelClass);
    }

    if (!self._isExcluded('PATCH', route + '/:id')) {
      self._generatePatch(app, modelClass);
    }

    if (!self._isExcluded('DELETE', route + '/:id')) {
      self._generateDelete(app, modelClass);
    }

    _.each(modelClass.getRelations(), function (relation) {
      var route = self._routeForRelation(relation);

      if (!self._isExcluded('POST', route)) {
        self._generateRelationPost(app, relation);
      }

      if (!self._isExcluded('GET', route)) {
        self._generateRelationGetAll(app, relation);
      }

      if (!self._isExcluded('DELETE', route)) {
        self._generateRelationDeleteAll(app, relation);
      }

      if (!(relation instanceof modelClass.OneToOneRelation)) {
        if (!self._isExcluded('PUT', route)) {
          self._generateRelationPutAll(app, relation);
        }
      }
    });
  });
};

RestApiGenerator.prototype._routeForModel = function (modelClass) {
  return this._routePrefix + this._pluralizer(_.camelCase(modelClass.name));
};

RestApiGenerator.prototype._routeForRelation = function (relation) {
  return this._routeForModel(relation.ownerModelClass) + '/:id/' + relation.name;
};

RestApiGenerator.prototype._isExcluded = function (method, route) {
  return _.any(this._exclude, function (exc) {
    if (exc.method.toLowerCase() === method.toLowerCase()) {
      if (_.isString(exc.exclude)) {
        return exc.exclude === route;
      } else {
        return exc.exclude.test(route);
      }
    } else {
      return false;
    }
  });
};

RestApiGenerator.prototype._generatePost = function (app, $modelClass) {
  var self = this;
  var route = this._routeForModel($modelClass);

  this._logger('POST ' + route);
  this._adapter(app, 'POST', route, function (req) {
    var modelClass = self._bindModelClass($modelClass, req);

    return self._objection.transaction(modelClass, function (modelClass) {
      return modelClass
        .query()
        .allowEager(self._findQueries[modelClass.tableName].allowEager())
        .eager(req.query.eager)
        .insert(req.body)
        .then(function (model) {
          return model.$query().first();
        });
    });
  });
};

RestApiGenerator.prototype._generateGetAll = function (app, $modelClass) {
  var self = this;
  var route = this._routeForModel($modelClass);

  this._logger('GET ' + route);
  this._adapter(app, 'GET', route, function (req) {
    var boundModelClass = self._bindModelClass($modelClass, req);
    return self._findQueries[boundModelClass.tableName].build(req.query, boundModelClass.query());
  });
};

RestApiGenerator.prototype._generateGet = function (app, $modelClass) {
  var self = this;
  var route = this._routeForModel($modelClass) + '/:id';

  this._logger('GET ' + route);
  this._adapter(app, 'GET', route, function (req) {
    var modelClass = self._bindModelClass($modelClass, req);

    return modelClass
      .query()
      .eager(req.query.eager)
      .allowEager(self._findQueries[modelClass.tableName].allowEager())
      .where(modelClass.idColumn, req.params.id)
      .first()
      .then(function (model) {
        if (!model) { throw error(404); }
        return model;
      });
  });
};

RestApiGenerator.prototype._generatePut = function (app, $modelClass) {
  var self = this;
  var route = this._routeForModel($modelClass) + '/:id';

  this._logger('PUT ' + route);
  this._adapter(app, 'PUT', route, function (req) {
    var modelClass = self._bindModelClass($modelClass, req);

    return modelClass
      .query()
      .update(req.body)
      .where(modelClass.idColumn, req.params.id)
      .then(function (model) {
        return modelClass
          .query()
          .allowEager(self._findQueries[modelClass.tableName].allowEager())
          .eager(req.query.eager)
          .where(modelClass.idColumn, req.params.id)
          .first();
      })
      .then(function (model) {
        if (!model) { throw error(404); }
        return model;
      });
  });
};

RestApiGenerator.prototype._generatePatch = function (app, $modelClass) {
  var self = this;
  var route = this._routeForModel($modelClass) + '/:id';

  this._logger('PATCH ' + route);
  this._adapter(app, 'PATCH', route, function (req) {
    var modelClass = self._bindModelClass($modelClass, req);

    return modelClass
      .query()
      .patch(req.body)
      .where(modelClass.idColumn, req.params.id)
      .then(function () {
        return modelClass
          .query()
          .allowEager(self._findQueries[modelClass.tableName].allowEager())
          .eager(req.query.eager)
          .where(modelClass.idColumn, req.params.id)
          .first();
      })
      .then(function (model) {
        if (!model) { throw error(404); }
        return model;
      });
  });
};

RestApiGenerator.prototype._generateDelete = function (app, $modelClass) {
  var self = this;
  var route = this._routeForModel($modelClass) + '/:id';

  this._logger('DELETE ' + route);
  this._adapter(app, 'DELETE', route, function (req) {
    var modelClass = self._bindModelClass($modelClass, req);

    return self._objection.transaction(modelClass, function (modelClass) {
      return modelClass
        .query()
        .delete()
        .where(modelClass.idColumn, req.params.id);
    }).then(function () {
      return {};
    });
  });
};

RestApiGenerator.prototype._generateRelationPost = function (app, relation) {
  var self = this;
  var route = this._routeForRelation(relation);

  this._logger('POST ' + route);
  this._adapter(app, 'POST', route, function (req) {
    var modelClass = self._bindModelClass(relation.ownerModelClass, req);

    return self._objection.transaction(modelClass, function (modelClass) {
      return modelClass
        .query()
        .where(modelClass.idColumn, req.params.id)
        .first()
        .then(function (model) {
          if (!model) { throw error(404); }
          return model
            .$relatedQuery(relation.name)
            .insert(req.body);
        })
        .then(function (model) {
          return model
            .$query()
            .first()
            .allowEager(self._findQueries[relation.relatedModelClass.tableName].allowEager())
            .eager(req.query.eager);
        });
    });
  });
};

RestApiGenerator.prototype._generateRelationGetAll = function (app, relation) {
  var self = this;
  var route = this._routeForRelation(relation);

  this._logger('GET ' + route);
  this._adapter(app, 'GET', route, function (req) {
    var modelClass = self._bindModelClass(relation.ownerModelClass, req);

    return modelClass
      .query()
      .where(modelClass.idColumn, req.params.id)
      .first()
      .then(function (model) {
        if (!model) { throw error(404); }
        var query = model.$relatedQuery(relation.name);
        self._findQueries[relation.relatedModelClass.tableName].build(req.query, query);

        if (relation instanceof modelClass.OneToOneRelation) {
          return query.first();
        } else {
          return query;
        }
      });
  });
};

RestApiGenerator.prototype._generateRelationPutAll = function (app, relation) {

};

RestApiGenerator.prototype._generateRelationDeleteAll = function (app, relation) {
  var self = this;
  var route = this._routeForRelation(relation);

  this._logger('DELETE ' + route);
  this._adapter(app, 'DELETE', route, function (req) {
    var modelClass = self._bindModelClass(relation.ownerModelClass, req);

    return modelClass
      .query()
      .where(modelClass.idColumn, req.params.id)
      .first()
      .then(function (model) {
        if (!model) { throw error(404); }
        var query = model.$relatedQuery(relation.name).delete();
      })
      .then(function () {
        return {};
      });
  });
};

RestApiGenerator.prototype._bindModelClass = function (modelClass, req) {
  if (this._databaseGetter) {
    return modelClass.bindKnex(this._databaseGetter(req));
  } else {
    return modelClass;
  }
};

function error(statusCode) {
  var err = new Error();
  err.statusCode = statusCode;
  return err;
}

module.exports = RestApiGenerator;
