var express = require('express');
var habitat = require('habitat');

habitat.load();

var app = express();
var env = new habitat();

app.use(express.static(path.join(__dirname, 'public')));
app.use(function (err, req, res, next) {
  res.send(404, err);
});

app.listen(env.get("PORT"), function(){
  console.log('Express server listening on ' + env.get("HOSTNAME"));
});
