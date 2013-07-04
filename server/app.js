var express = require('express');
var habitat = require('habitat');
var os = require('os');
var path = require('path');

habitat.load();

var app = express();
var env = new habitat();

var routes = require('./routes');

// lovingly borrowed from http://stackoverflow.com/questions/7067966/how-to-allow-cors-in-express-nodejs
var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}

app.get('/components.json',
  routes.list.components('/components',
    path.join(__dirname, '../sandbox/components')));

app.use(express.static(path.join(__dirname, '../sandbox')));

app.use(function (err, req, res, next) {
  res.send(404, err);
});

app.use(express.logger("dev"));

app.use(allowCrossDomain);

app.listen(env.get("PORT"), function(){
  console.log('Express server listening on ' + os.hostname());
});
