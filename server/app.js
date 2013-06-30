var express = require('express');
var habitat = require('habitat');
var path = require('path');

habitat.load();

var app = express();
var env = new habitat();

var routes = require('./routes');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../appbuilder.js/dist')));
app.use(function (err, req, res, next) {
  res.send(404, err);
});

app.get('/api/list/components',
  routes.list.components(env.get("HOSTNAME") + '/components',
  path.join(__dirname, 'public/components')));

app.use(express.logger("dev"));

app.listen(env.get("PORT"), function(){
  console.log('Express server listening on ' + env.get("HOSTNAME"));
});
