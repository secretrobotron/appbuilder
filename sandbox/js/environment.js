(function () {
  window.appbuilder = window.appbuilder || {};

  var scripts = document.getElementsByTagName('script');
  var thisScriptTag = scripts[scripts.length - 1];

  var __componentsUrl = 'components.json';
  var __useJSONPForComponents = thisScriptTag.hasAttribute('data-components-jsonp');

  if (thisScriptTag.hasAttribute('data-components-url')) {
    __componentsUrl = thisScriptTag.getAttribute('data-components-url');
  }

  function createXHR (url, callback, method) {
    if (!callback) {
      throw 'callback required';
    }

    if (!url) {
      throw 'url required';
    }

    var xhr = new XMLHttpRequest();
    method = method || 'GET';
    xhr.open(method, url, true);

    function onLoad (e) {
      removeListeners();
      callback(null, xhr.response);
    }

    function onError (e) {
      removeListeners();
      callback(e, null);
    }

    function removeListeners () {
      xhr.removeEventListener('load', onLoad, false);
      xhr.removeEventListener('error', onError, false);      
      xhr.removeEventListener('abort', onError, false);      
    }

    xhr.addEventListener('load', onLoad, false);
    xhr.addEventListener('error', onError, false);
    xhr.addEventListener('abort', onError, false);

    xhr.send();
  }

  var __ffosComponents = {};

  window.appbuilder.environment = {
    defineFFOSComponent: function (name, callback) {
      __ffosComponents[name] = callback;
    },
    registerExistingFFOSComponents: function (elementCallback) {
      Object.keys(__ffosComponents).forEach(function (componentName) {
        var elements = document.querySelectorAll(componentName);
        Array.prototype.forEach.call(elements, function (element) {
          appbuilder.environment.initFFOSComponent(element);
          elementCallback(element);
        });
      });
    },
    initFFOSComponent: function (element) {
      var name = element.localName;
      __ffosComponents[name] && __ffosComponents[name].call(element);
    },
    getComponents: function (callback) {
      if (!callback) {
        throw 'callback required';
      }

      if (__useJSONPForComponents) {
        window.__componentsListCallback__ = function (data) {
          document.head.removeChild(componentsScript);  
          callback(data);
        };
        var componentsScript = document.createElement('script');
        componentsScript.src = __componentsUrl;
        componentsScript.type = 'text/javascript';
        document.head.appendChild(componentsScript);
      }
      else {
        createXHR(__componentsUrl, function (err, data) {
          if (!err) {
            try {
              var list = JSON.parse(data);
              setTimeout(function() {
                callback(list);
              }, 0);
            }
            catch (e) {
              console.error('Failed to parse component list: ', e);
              callback(null);
            }
          }
          else {
            console.error('Failed to retrieve list of components: ', e);
            callback(null);
          }
        });
      }
    }
  };
})();