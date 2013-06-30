var fs = require('fs');
var path = require('path');
var html5 = require('html5');
var jsdom = require('html5/node_modules/jsdom');

function ManifestDataException (message) {
  this.message = message;
  this.toString = function () {
    return message;
  }
}

var failureQualifiers = [
  function (d) {if (!d.name) throw ManifestDataException('component manifest does not contain "name" field.');},
  function (d) {if (!d.inputs) throw ManifestDataException('component manifest does not contain "inputs" field.');},
  function (d) {if (!d.outputs) throw ManifestDataException('component manifest does not contain "outputs" field.');},
];

module.exports = function (componentsBaseUrl, componentsDir) {
  var list = [];
  
  fs.readdir(componentsDir, function (err, files) {
    files.forEach(function (file) {
      fs.readFile(path.join(componentsDir, file), 'utf-8', function (err, fileData) {
        var window = jsdom.jsdom(null, null, {parser: html5}).createWindow();
        var parser = new html5.Parser({document: window.document});
        parser.parse(fileData);
        var manifestScriptTag = parser.document.querySelector('script[data-appbuilder-manifest]');
        if (manifestScriptTag) {
          try {
            var jsonData = JSON.parse(manifestScriptTag.innerHTML);
            jsonData.url = componentsBaseUrl + '/' + file;
            list.push(jsonData);
          }
          catch (e) {
            if (e instanceof ManifestDataException) {
              console.err('Error parsing component "' + file + '": ' + e.toString());
            }
          }
        }
        else {
          console.warn('Component "' + file + '" has no valid manifest.');
        }
      });
    });
  });

  return function (req, res) {
    res.json(list, 200);
  };
};