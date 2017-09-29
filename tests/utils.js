'use strict';

var _ = require('lodash');
var os = require('os');
var path = require('path');
var Knex = require('knex');
var Promise = require('bluebird');
var objection = require('objection');

module.exports = {
  testDatabaseConfigs: [{
    client: 'sqlite3',
    connection: {
      filename: path.join(os.tmpdir(), 'objection_rest_test.db')
    },
    pool: {
      afterCreate: function (conn, cb) {
        conn.run('PRAGMA foreign_keys = ON;', function (err) {
          cb(err, conn);
        });
      }
    },
    useNullAsDefault: true
  }, {
    client: 'postgres',
    connection: {
      host: '127.0.0.1',
      database: 'objection_rest_test'
    },
    pool: {
      min: 0,
      max: 10
    }
  }, {
    client: 'mysql',
    connection: {
      host: '127.0.0.1',
      user: 'travis',
      database: 'objection_rest_test'
    },
    pool: {
      min: 0,
      max: 10
    }
  }],

  initialize: function (knexConfig) {
    var knex = Knex(knexConfig);
    return {
      config: knexConfig,
      models: createModels(knex),
      knex: knex
    };
  },

  dropDb: function (session) {
    return session.knex.schema
      .dropTableIfExists('Person_Movie')
      .dropTableIfExists('Movie')
      .dropTableIfExists('Animal')
      .dropTableIfExists('Person');
  },

  createDb: function (session) {
    return session.knex.schema
      .createTableIfNotExists('Person', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.integer('age');
        table.biginteger('pid').unsigned().references('Person.id').index().onDelete('SET NULL');
        table.string('firstName');
        table.string('lastName');
      })
      .createTableIfNotExists('Animal', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.biginteger('ownerId').unsigned().references('Person.id').index().onDelete('CASCADE');
        table.string('name').index();
      })
      .createTableIfNotExists('Movie', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.string('name').index();
      })
      .createTableIfNotExists('Person_Movie', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.biginteger('actorId').unsigned().references('Person.id').index().onDelete('CASCADE');
        table.biginteger('movieId').unsigned().references('Movie.id').index().onDelete('CASCADE');
      })
      .then(function () {
        if (session.config.client === 'postgres') {
          // Index to speed up wildcard searches.
          return Promise.join(
            session.knex.raw('CREATE INDEX "movie_name_wildcard_index" ON "Movie" USING btree ("name" varchar_pattern_ops)'),
            session.knex.raw('CREATE INDEX "animal_name_wildcard_index" ON "Animal" USING btree ("name" varchar_pattern_ops)')
          );
        }
      })
  },

  insertData: function (session, counts, progress) {
    progress = progress || _.noop;

    var C = 30;
    var P = counts.persons;
    var A = counts.pets;
    var M = counts.movies;
    var zeroPad = createZeroPad(Math.max(P * A, P * M));

    var persons = _.times(P, function (p) {
      return session.models.Person.fromJson({
        id: p + 1,
        firstName: 'F' + zeroPad(p),
        lastName: 'L' + zeroPad(P - p - 1),
        age: p * 10,

        pets: _.times(A, function (a) {
          var id = p * A + a + 1;
          return {id: id, name: 'P' + zeroPad(id - 1), ownerId: p + 1};
        }),

        movies: _.times(M, function (m) {
          var id = p * M + m + 1;
          return {id: id, name: 'M' + zeroPad(P * M - id)};
        }),

        personMovies: _.times(M, function (m) {
          var id = p * M + m + 1;
          return {id: id, actorId: p + 1, movieId: id};
        })
      });
    });

    return Promise.all(_.map(_.chunk(persons, C), function (personChunk) {
      return session.knex('Person').insert(pick(personChunk, ['id', 'firstName', 'lastName', 'age']));
    })).then(function () {
      return session.knex('Person').update('pid', session.knex.raw('id - 1')).where('id', '>', 1);
    }).then(function () {
      progress('1/4');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'pets')), C), function (animalChunk) {
        return session.knex('Animal').insert(animalChunk);
      }));
    }).then(function () {
      progress('2/4');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'movies')), C), function (movieChunk) {
        return session.knex('Movie').insert(movieChunk);
      }));
    }).then(function () {
      progress('3/4');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'personMovies')), C), function (movieChunk) {
        return session.knex('Person_Movie').insert(movieChunk);
      }));
    }).then(function () {
      return Promise.join(
        resetIdSequence(session, 'Person', P),
        resetIdSequence(session, 'Animal', P * A),
        resetIdSequence(session, 'Movie', P * M),
        resetIdSequence(session, 'Person_Movie', P * M)
      );
    }).then(function () {
      progress('4/4');
    });
  },

  truncateDb: function (session) {
    var deletes = [
      session.knex('Movie').delete(),
      session.knex('Animal').delete(),
      session.knex('Person').delete(),
      session.knex('Person_Movie').delete()
    ];

    var promise = Promise.resolve();
    _.each(deletes, function (del) {
      promise = promise.then(function () {
        return del;
      });
    });

    return promise;
  }
};

function createModels(knex) {
  class Person extends objection.Model {}
  class Animal extends objection.Model {}
  class Movie extends objection.Model {}

  Person.tableName = 'Person';
  Animal.tableName = 'Animal';
  Movie.tableName = 'Movie';

  Person.knex(knex);
  Animal.knex(knex);
  Movie.knex(knex);

  Person.prototype.fullName = function () {
    return this.firstName + ' ' + this.lastName;
  };

  Person.relationMappings = {
    parent: {
      relation: objection.BelongsToOneRelation,
      modelClass: Person,
      join: {
        from: 'Person.pid',
        to: 'Person.id'
      }
    },

    children: {
      relation: objection.HasManyRelation,
      modelClass: Person,
      join: {
        from: 'Person.id',
        to: 'Person.pid'
      }
    },

    pets: {
      relation: objection.HasManyRelation,
      modelClass: Animal,
      join: {
        from: 'Person.id',
        to: 'Animal.ownerId'
      }
    },

    movies: {
      relation: objection.ManyToManyRelation,
      modelClass: Movie,
      join: {
        from: 'Person.id',
        through: {
          from: 'Person_Movie.actorId',
          to: 'Person_Movie.movieId'
        },
        to: 'Movie.id'
      }
    }
  };

  return {
    Person: Person,
    Animal: Animal,
    Movie: Movie
  };
}

function createZeroPad(N) {
  // log(x) / log(10) == log10(x)
  var n = Math.ceil(Math.log(N) / Math.log(10));

  return function (num) {
    num = num.toString();

    while (num.length < n) {
      num = '0' + num;
    }

    return num;
  };
}

function pick(arr, picks) {
  return _.map(arr, function (obj) {
    return _.pick(obj, picks);
  });
}

function resetIdSequence(session, table, newId) {
  if (session.config.client === 'sqlite3') {
    if (newId && _.isFinite(newId)) {
      return session.knex.raw('UPDATE sqlite_sequence SET seq = ' + newId + ' WHERE name = "' + table + '"');
    }
  } else if (session.config.client === 'postgres') {
    if (newId && _.isFinite(newId)) {
      return session.knex.raw('ALTER SEQUENCE "' + table  + '_id_seq" RESTART WITH ' + (newId + 1));
    }
  } else if (session.config.client === 'mysql') {
    if (newId && _.isFinite(newId)) {
      return session.knex.raw('ALTER TABLE ' + table + ' AUTO_INCREMENT = ' + (newId + 1));
    }
  } else {
    throw new Error('sequence truncate not implemented for the given database');
  }
}

