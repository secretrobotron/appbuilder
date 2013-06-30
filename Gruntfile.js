module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    requirejs: {
      compile: {
        options: {
          name: '<%= pkg.name %>',
          baseUrl: 'appbuilder.js/src',
          out: "appbuilder.js/dist/<%= pkg.name %>.js",
          optimize: 'none',
          include: ['../lib/platform.js', '../lib/require'],
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
        files: ['appbuilder.js/src/**/*.js'],
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
  grunt.registerTask('default', ['requirejs', 'uglify']);
};