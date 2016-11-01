[![Build Status](https://travis-ci.org/Vincit/objection-rest.svg?branch=master)](https://travis-ci.org/Vincit/objection-rest) [![Coverage Status](https://coveralls.io/repos/Vincit/objection-rest/badge.svg?branch=master&service=github)](https://coveralls.io/github/Vincit/objection-rest?branch=master)

# Topics

- [Introduction](#fast-introduction)
- [Installation](#installation)
- [Getting started](#getting-started)
- [API documentation](#api-documentation)

# Introduction

REST API generator for objection.js models.

# Installation

```sh
npm install objection objection-rest
```

# Getting started

```
var objection = require('objection');
var ObjectionRest = require('objection-rest');
var Person = require('./models/Person');
var Movie = require('./models/Movie');

ObjectionRest(objection)
	.routePrefix('/api')
	.addModel(Person, function(findQuery) {
		// findQuery.registerFilter(...) see objection-find
	})
	.addModel(Movie)
	.generate(app);
```

# API documentation

See [objection-find documentation](https://github.com/Vincit/objection-find) for
the findQuery API.
