(function () {
  window.appbuilder = window.appbuilder || {};

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

  window.appbuilder.environment = {
    getComponents: function (callback) {
      if (!callback) {
        throw 'callback required';
      }

      createXHR('/api/list/components', function (err, data) {
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
  };
})();