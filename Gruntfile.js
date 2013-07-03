'use strict';

var fs = require('fs');

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
        files: ['appbuilder.js/lib/*', 'appbuilder.js/src/**/*.js', 'appbuilder.js/src/**/*.css', 'appbuilder.js/src/**/*.html'],
        tasks: ['default'],
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

  grunt.registerTask('install', function () {
    copyFile('appbuilder.js/dist/appbuilder.js', 'public/js/appbuilder.js');
    copyFile('appbuilder.js/dist/appbuilder.min.js', 'public/js/appbuilder.min.js');
    copyFile('appbuilder.js/lib/platform.min.js', 'public/vendor/platform.min.js');
  });

  grunt.registerTask('default', ['requirejs', 'uglify', 'install']);
};