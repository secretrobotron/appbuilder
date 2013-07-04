var express = require('express');
var habitat = require('habitat');
var os = require('os');
var path = require('path');

habitat.load();

var app = express();
var env = new habitat();

var routes = require('./routes');

app.get('/components.json',
  routes.list.components('/components',
    path.join(__dirname, '../sandbox/components')));

app.use(express.static(path.join(__dirname, '../sandbox')));

app.use(function (err, req, res, next) {
  res.send(404, err);
});

app.use(express.logger("dev"));

app.listen(env.get("PORT"), function(){
  console.log('Express server listening on ' + os.hostname());
});
