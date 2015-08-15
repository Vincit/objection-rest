# Install and run

```sh
git clone git@github.com:Vincit/objection-find.js.git objection-find
cd objection-find/examples/express
npm install
# We use knex for migrations in this example.
npm install knex -g
knex migrate:latest
npm start
```

Now you can open a browser to address `http://localhost:3952/index.html
