'use strict';

var fs = require('fs');
var path = require('path');
var html5 = require('html5');
var jsdom = require('html5/node_modules/jsdom');

module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    requirejs: {
      compile: {
        options: {
          name: '<%= pkg.name %>',
          baseUrl: 'appbuilder.js/src',
          out: 'appbuilder.js/dist/<%= pkg.name %>.js',
          optimize: 'none',
          include: ['../lib/require'],
          insertRequire: ['appbuilder']
        }
      }
    },
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'appbuilder.js/dist/<%= pkg.name %>.js',
        dest: 'appbuilder.js/dist/<%= pkg.name %>.min.js'
      }
    },
    watch: {
      scripts: {
        files: ['sandbox/components/**/*', 'appbuilder.js/lib/*', 'appbuilder.js/src/**/*.js', 'appbuilder.js/src/**/*.css', 'appbuilder.js/src/**/*.html'],
        tasks: ['components', 'default'],
        options: {
          nospawn: true,
        },
      },
    }
  });

  grunt.loadNpmTasks('grunt-contrib-requirejs');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');

  function copyFile (path1, path2) {
    var data = fs.readFileSync(path1);
    fs.writeFileSync(path2, data);
  }

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

  grunt.registerTask('components', function () {
    console.log('DOIN IT');
    var list = [];

    fs.readdir('sandbox/components', function (err, files) {
      files.forEach(function (file) {
        var fileData = fs.readFileSync(path.join('sandbox/components', file), 'utf-8');
        var window = jsdom.jsdom(null, null, {parser: html5}).createWindow();
        var parser = new html5.Parser({document: window.document});

        parser.parse(fileData);

        var manifestScriptTag = parser.document.querySelector('script[data-appbuilder-manifest]');

        if (manifestScriptTag) {
          var jsonData = JSON.parse(manifestScriptTag.innerHTML);
          jsonData.url = 'components/' + file;
          list.push(jsonData);
        }
        else {
          console.warn('Component "' + file + '" has no valid manifest.');
        }
      });
    
      var outputString = JSON.stringify(list);

      fs.writeFile('sandbox/components.json', outputString);
      fs.writeFile('sandbox/components.jsonp', '__componentsListCallback__(' + outputString + ')');
    });    
  });

  grunt.registerTask('install', function () {
    copyFile('appbuilder.js/dist/appbuilder.js', 'public/js/appbuilder.js');
    copyFile('appbuilder.js/dist/appbuilder.min.js', 'public/js/appbuilder.min.js');
    copyFile('appbuilder.js/lib/platform.min.js', 'public/vendor/platform.min.js');
  });

  grunt.registerTask('default', ['requirejs', 'uglify', 'install']);
};